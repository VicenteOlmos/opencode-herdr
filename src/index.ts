import { Model, Plugin } from "@opencode/plugin"
import { join } from "node:path"
import { loadSnapshotForBoot, refreshSnapshot, type Snapshot } from "./capabilities.js"
import { herdrTools, resolvePaneTarget } from "./command.js"
import { HerdrController } from "./controller.js"
import { HandoverAbort, HerdrError } from "./errors.js"
import { createHandover, formatHandoverConfirmation, parseHandoverArgs } from "./handover.js"
import { HerdrPool } from "./pool.js"
import { sanitize } from "./sanitize.js"
import { herdrProviderInfo, targetsToProviderModels } from "./opencode-config.js"
import { readRouting } from "./routing.js"
import { resolvePluginOptions } from "./plugin-options.js"
import { installHerdrSkill } from "./skill-install.js"
import {
  handleHerdrDelete,
  handleHerdrStatus,
  handleHerdrTest,
  type SlashDeps,
  type ToastFn,
} from "./slash.js"
import { createHerdr } from "./provider.js"

export { createHerdr } from "./provider.js"
export { HandoverAbort } from "./errors.js"

const herdrId = /^[a-zA-Z0-9._:-]+$/
const run = async (argv: string[]) => {
  // Pass env explicitly so mid-process PATH updates (tests / wrappers) are visible.
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: process.env })
  return { code: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() }
}

export const HerdrPlugin = Plugin.define({
  id: "opencode-herdr",
  async setup(context) {
    const targets: import("./adapters/types.js").Target[] = []
    let herdr = false
    let snapshot: Snapshot = { schemaVersion: 1, createdAt: "", herdr: false, runtimes: [], targets: [] }
    let providerModels = targetsToProviderModels(targets)
    const flags = resolvePluginOptions(context.options)
    const defaultRuntime = flags.handoverDefault
    const directory = context.location.directory

    const runtimeCtx = () => {
      const workspace = process.env.HERDR_WORKSPACE_ID
      const tab = process.env.HERDR_TAB_ID
      const pane = process.env.HERDR_PANE_ID
      if (
        !directory.startsWith("/")
        || !workspace
        || !tab
        || !pane
        || !herdrId.test(workspace)
        || !herdrId.test(tab)
        || !herdrId.test(pane)
      ) {
        throw new HerdrError("valid Herdr runtime context is required")
      }
      return { cwd: directory, workspace, tab, pane }
    }
    const controller = () => new HerdrController({
      root: "/tmp",
      ...runtimeCtx(),
      keepPanes: flags.keepPanes,
      keepJobs: flags.keepJobs,
    })
    const pool = () => new HerdrPool({ run })
    const stateDir = join(
      process.env.XDG_STATE_HOME ?? join(process.env.HOME ?? "/tmp", ".local", "state"),
      "opencode-herdr",
    )
    const applySnapshot = (next: Snapshot) => {
      snapshot = next
      targets.splice(0, targets.length, ...next.targets)
      herdr = next.herdr
    }
    const refresh = async () => {
      const fresh = await refreshSnapshot(stateDir, { run })
      applySnapshot(fresh)
      providerModels = targetsToProviderModels(targets)
      await context.provider.reload()
      return fresh
    }
    const notifySession = async (sessionID: string, description: string, text: string) => {
      await context.session.synthetic({ sessionID, description, text, resume: false })
    }
    const slashDeps = (sessionID: string): SlashDeps => ({
      snapshot: () => snapshot,
      refresh,
      runtimeCtx,
      run,
      pool,
      directory,
      defaultRuntime,
      keepPanes: flags.keepPanes,
      propagatePostSessionError: true,
      postSession: (markdown) => notifySession(sessionID, "Herdr command result", markdown),
    })
    const herdrSdk = createHerdr({ targets, execute: (target, options) => controller().execute(target, options) })

    const { snapshot: boot, refresh: pending } = await loadSnapshotForBoot(stateDir, { run })
    let unloaded = false
    applySnapshot(boot)
    providerModels = targetsToProviderModels(targets)

    await context.provider.transform((editor) => {
      editor.add({ info: herdrProviderInfo(), models: providerModels })
    })
    await context.aisdk.hook("sdk", (event) => {
      if (event.model.providerID === "herdr") event.sdk = herdrSdk
    })
    await context.aisdk.hook("language", (event) => {
      if (event.model.providerID === "herdr") {
        const effort = typeof event.options.effort === "string" ? event.options.effort : undefined
        event.language = herdrSdk.languageModel(event.model.modelID, effort)
      }
    })
    await context.agent.transform((editor) => {
      const routing = readRouting()
      for (const [agentID, assignment] of Object.entries(routing.assignments)) {
        if (!assignment.model.startsWith("herdr/")) continue
        const model = Model.Ref.parse(assignment.model)
        editor.update(agentID, (agent) => {
          const variant = assignment.variant
            ? Model.VariantID.make(assignment.variant)
            : agent.model?.variant
          agent.model = { ...model, ...(variant ? { variant } : {}) }
        })
      }
    })
    await context.tool.transform((editor) => {
      const tools = herdrTools(() => targets, controller, async () => { await refresh() }, () => herdr)
      editor.add(tools.herdr_capabilities)
      editor.add(tools.herdr_pane)
    })
    await context.command.transform((editor) => {
      editor.add({
        name: "herdr-pane",
        description: "Delegate an explicit task to a Herdr runtime. Args: <runtime> <task>",
        async execute(input) {
          const [runtime, ...parts] = input.prompt.text.trim().split(/\s+/)
          const task = parts.join(" ").trim()
          if (!runtime || !task) {
            await notifySession(input.sessionID, "Herdr pane", "Usage: /herdr-pane <runtime> <task>")
            return
          }
          try {
            const target = resolvePaneTarget(targets, runtime)
            const result = await controller().execute(target, {
              prompt: [{ role: "user", content: [{ type: "text", text: task }] }],
            })
            if (result.status !== "done") throw new HerdrError(result.diagnostic || "Herdr task failed")
            await notifySession(input.sessionID, "Herdr pane result", result.text ?? "")
          } catch (error) {
            await notifySession(input.sessionID, "Herdr pane error", error instanceof Error ? error.message : "Herdr task failed")
          }
        },
      })
      editor.add({
        name: "herdr-handover",
        description: "Hand over to a Herdr pane and send a context prompt. Args: <runtime> [note]",
        async execute(input) {
          if (!herdr) throw new HerdrError("Herdr unavailable")
          const ctx = runtimeCtx()
          const { runtime, note } = parseHandoverArgs(input.prompt.text)
          const result = await createHandover({
            sessionId: input.sessionID,
            directory: ctx.cwd,
            workspace: ctx.workspace,
            tab: ctx.tab,
            pane: ctx.pane,
            runtime,
            defaultRuntime,
            note,
            stateDir,
            run,
          })
          await notifySession(input.sessionID, "Herdr handover", formatHandoverConfirmation(result))
        },
      })
      const addSlash = (
        name: string,
        execute: (deps: SlashDeps, output: { parts: unknown[] }, toast: ToastFn) => Promise<void>,
      ) => {
        editor.add({
          name,
          async execute(input) {
            try {
              await execute(slashDeps(input.sessionID), { parts: [] }, async () => undefined)
            } catch (error) {
              if (!(error instanceof HandoverAbort)) throw error
            }
          },
        })
      }
      addSlash("herdr-status", handleHerdrStatus)
      addSlash("herdr-test", handleHerdrTest)
      addSlash("herdr-delete", handleHerdrDelete)
    })

    if (flags.debug || flags.keepPanes || flags.keepJobs) {
      console.error(`[herdr] debug mode: keepPanes=${flags.keepPanes} keepJobs=${flags.keepJobs} debug=${flags.debug}`)
    }
    void installHerdrSkill().catch(() => undefined)
    void pending.then(async (fresh) => {
      if (unloaded) return
      applySnapshot(fresh)
      providerModels = targetsToProviderModels(targets)
      await context.provider.reload()
    }).catch((error) => {
      if (!unloaded) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[herdr] background refresh failed:", sanitize(message, 1_000))
      }
    })
    return () => { unloaded = true }
  },
})

export default HerdrPlugin
