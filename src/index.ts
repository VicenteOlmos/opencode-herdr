import type { Plugin, PluginModule } from "@opencode-ai/plugin"
import { loadSnapshotForBoot, refreshSnapshot, type Snapshot } from "./capabilities.js"
import { injectConfig } from "./opencode-config.js"
import { applyRoutingInPlace } from "./routing.js"
import { herdrTools } from "./command.js"
import { HerdrController } from "./controller.js"
import { HandoverAbort, HerdrError } from "./errors.js"
import { createHandover, formatHandoverConfirmation, parseHandoverArgs } from "./handover.js"
import { HerdrPool } from "./pool.js"
import { resolvePluginOptions } from "./plugin-options.js"
import { installHerdrSkill } from "./skill-install.js"
import {
  formatPresenceToast,
  handleHerdrDelete,
  handleHerdrStatus,
  handleHerdrTest,
  type SlashDeps,
} from "./slash.js"
import { join } from "node:path"

export { createHerdr } from "./provider.js"
export { HandoverAbort } from "./errors.js"

const herdrId = /^[a-zA-Z0-9._:-]+$/
const run = async (argv: string[]) => {
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" })
  return { code: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() }
}
const server: Plugin = async (context, options) => {
  let targets: import("./adapters/types.js").Target[] = []
  let herdr = false
  let snapshot: Snapshot = { schemaVersion: 1, createdAt: "", herdr: false, runtimes: [], targets: [] }
  const toastedSessions = new Set<string>()
  const flags = resolvePluginOptions(options as Record<string, unknown> | undefined)
  const defaultRuntime = flags.handoverDefault
  const runtimeCtx = () => {
    const workspace = process.env.HERDR_WORKSPACE_ID
    const tab = process.env.HERDR_TAB_ID
    const pane = process.env.HERDR_PANE_ID
    if (
      !context.directory.startsWith("/")
      || !workspace
      || !tab
      || !pane
      || !herdrId.test(workspace)
      || !herdrId.test(tab)
      || !herdrId.test(pane)
    ) {
      throw new HerdrError("valid Herdr runtime context is required")
    }
    return { cwd: context.directory, workspace, tab, pane }
  }
  const tryRuntimeCtx = () => {
    try {
      const workspace = process.env.HERDR_WORKSPACE_ID
      const tab = process.env.HERDR_TAB_ID
      const pane = process.env.HERDR_PANE_ID
      if (
        !context.directory.startsWith("/")
        || !workspace
        || !tab
        || !pane
        || !herdrId.test(workspace)
        || !herdrId.test(tab)
        || !herdrId.test(pane)
      ) {
        return { cwd: context.directory, workspace: "local", tab: "local", pane: "local" }
      }
      return { cwd: context.directory, workspace, tab, pane }
    } catch {
      return { cwd: context.directory, workspace: "local", tab: "local", pane: "local" }
    }
  }
  const controller = () => new HerdrController({
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
    targets = next.targets
    herdr = next.herdr
  }
  const refresh = async () => {
    const fresh = await refreshSnapshot(stateDir, { run })
    applySnapshot(fresh)
    return fresh
  }
  const slashDeps = (sessionID?: string): SlashDeps => ({
    snapshot: () => snapshot,
    refresh,
    runtimeCtx,
    run,
    pool,
    directory: context.directory,
    defaultRuntime,
    keepPanes: flags.keepPanes,
    postSession: sessionID
      ? async (markdown) => {
          // Do not set synthetic: true — TUI UserMessage filters those out (!x.synthetic).
          await context.client.session.prompt({
            path: { id: sessionID },
            body: {
              noReply: true,
              parts: [{ type: "text", text: markdown }],
            },
          })
        }
      : undefined,
  })
  const showToast = async (input: { title: string; message: string; variant: "info" | "success" | "warning" | "error"; duration?: number }) => {
    await context.client.tui.showToast({
      body: {
        title: input.title,
        message: input.message,
        variant: input.variant,
        duration: input.duration ?? 8_000,
      },
    }).catch(() => undefined)
  }
  return {
    async config(config) {
      // Cache-first boot: avoid blocking OpenCode on multi-second CLI discovery.
      const { snapshot: boot, refresh: pending } = await loadSnapshotForBoot(stateDir, { run })
      applySnapshot(boot)
      injectConfig(config, targets, {
        ...tryRuntimeCtx(),
        keepPanes: flags.keepPanes,
        keepJobs: flags.keepJobs,
        debug: flags.debug,
      })
      applyRoutingInPlace(config)
      if (flags.debug || flags.keepPanes || flags.keepJobs) {
        console.error(`[herdr] debug mode: keepPanes=${flags.keepPanes} keepJobs=${flags.keepJobs} debug=${flags.debug}`)
      }
      void installHerdrSkill().catch(() => undefined)
      void pending.then(applySnapshot).catch(() => undefined)
    },
    tool: herdrTools(() => targets, controller, async () => { await refresh() }, () => herdr),
    async event(input) {
      if (input.event.type === "session.deleted") {
        toastedSessions.delete(input.event.properties.info.id)
        return
      }
      if (input.event.type !== "session.created") return
      const sessionId = input.event.properties.info.id
      if (toastedSessions.has(sessionId)) return
      toastedSessions.add(sessionId)
      const toast = formatPresenceToast(targets)
      await showToast({ ...toast, duration: 8_000 })
    },
    async "command.execute.before"(input, output) {
      if (input.command === "herdr-status") {
        await handleHerdrStatus(slashDeps(input.sessionID), output, showToast)
        return
      }
      if (input.command === "herdr-test") {
        await handleHerdrTest(slashDeps(input.sessionID), output, showToast)
        return
      }
      if (input.command === "herdr-delete") {
        await handleHerdrDelete(slashDeps(input.sessionID), output, showToast)
        return
      }
      if (input.command !== "herdr-handover") return
      if (!herdr) throw new HerdrError("Herdr unavailable")
      const ctx = runtimeCtx()
      const { runtime, note } = parseHandoverArgs(input.arguments)
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
      // Do not leave parts for SessionPrompt — that would Enter/submit into this OpenCode session.
      output.parts.splice(0, output.parts.length)
      const summary = formatHandoverConfirmation(result)
      await showToast({
        title: "Herdr handover",
        message: `${result.runtime} · pane ${result.paneId}`,
        variant: "success",
        duration: 8_000,
      })
      // Abort OpenCode command pipeline before it creates a user message / LLM turn.
      throw new HandoverAbort(summary)
    },
  }
}
export const HerdrPlugin: PluginModule = { id: "opencode-herdr", server }
export default HerdrPlugin
