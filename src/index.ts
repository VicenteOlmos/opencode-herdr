import { Model, Plugin, Provider } from "@opencode-ai/plugin"
import { isAbsolute, join } from "node:path"
import { loadSnapshotForBoot, refreshSnapshot, type Snapshot } from "./capabilities.js"
import { herdrTools } from "./command.js"
import { HerdrController } from "./controller.js"
import { HerdrError } from "./errors.js"
import { sanitize } from "./sanitize.js"
import { herdrPackageNpm, herdrProviderInfo, targetsToProviderModels } from "./opencode-config.js"
import { readRouting } from "./routing.js"
import { resolvePluginOptions } from "./plugin-options.js"
import { installHerdrSkill } from "./skill-install.js"
import { executeWithHerdrLocation, stampRequestDirectory } from "./request-location.js"
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
  tui: true,
  async setup(context) {
    const targets: import("./adapters/types.js").Target[] = []
    let herdr = false
    let snapshot: Snapshot = { schemaVersion: 1, createdAt: "", herdr: false, runtimes: [], targets: [] }
    const flags = resolvePluginOptions(context.options)
    let providerModels = targetsToProviderModels(targets)
    const runtimeCtx = (directory: string) => {
      const workspace = process.env.HERDR_WORKSPACE_ID
      const tab = process.env.HERDR_TAB_ID
      const pane = process.env.HERDR_PANE_ID
      if (
        !isAbsolute(directory)
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
    const controller = (directory: string) => new HerdrController({
      root: "/tmp",
      ...runtimeCtx(directory),
      keepPanes: flags.keepPanes,
      keepJobs: flags.keepJobs,
    })
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
      await context.catalog.reload()
      return fresh
    }
    const sessionDirectory = async (sessionID: string): Promise<string> => {
      const session = await context.session.get({ sessionID })
      const directory = session.location?.directory
      if (typeof directory !== "string" || !isAbsolute(directory)) {
        throw new HerdrError("Herdr session workspace is unavailable")
      }
      return directory
    }
    const { snapshot: boot, refresh: pending } = await loadSnapshotForBoot(stateDir, { run })
    let unloaded = false
    applySnapshot(boot)
    providerModels = targetsToProviderModels(targets)

    const herdrSdk = createHerdr({
      targets,
      execute: (target, options) => executeWithHerdrLocation(options, (directory, cleanOptions) =>
        controller(directory).execute(target, cleanOptions)),
    })

    await context.catalog.transform((editor) => {
      editor.provider.update("herdr", (provider) => Object.assign(provider, herdrProviderInfo()))
      const desired = new Set(providerModels.map((model) => String(model.id)))
      for (const record of editor.provider.list()) {
        if (String(record.provider.id) !== "herdr") continue
        for (const modelID of record.models.keys()) {
          if (!desired.has(String(modelID))) editor.model.remove(Provider.ID.make("herdr"), Model.ID.make(String(modelID)))
        }
      }
      for (const model of providerModels) editor.model.update("herdr", String(model.id), (draft) => Object.assign(draft, model))
    })
    await context.catalog.reload()
    await context.aisdk.hook("sdk", (event) => {
      if (event.package === herdrPackageNpm()) event.sdk = herdrSdk
    })
    await context.aisdk.hook("language", (event) => {
      if (event.model.providerID !== "herdr") return
      const effort = typeof event.options.effort === "string" ? event.options.effort : undefined
      event.language = herdrSdk.languageModel(event.model.modelID, effort)
    })
    await context.session.hook("model.request", async (event) => {
      if (event.model.providerID !== "herdr") return
      const directory = await sessionDirectory(event.sessionID)
      event.headers = stampRequestDirectory(event.headers, directory)
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
      const tools = herdrTools(() => targets, async (sessionID: string) => controller(await sessionDirectory(sessionID)), async () => { await refresh() }, () => herdr)
      editor.add(tools.herdr_capabilities)
      editor.add(tools.herdr_pane)
    })

    if (flags.debug || flags.keepPanes || flags.keepJobs) {
      console.error(`[herdr] debug mode: keepPanes=${flags.keepPanes} keepJobs=${flags.keepJobs} debug=${flags.debug}`)
    }
    void installHerdrSkill().catch(() => undefined)
    void pending.then(async (fresh) => {
      if (unloaded) return
      applySnapshot(fresh)
      providerModels = targetsToProviderModels(targets)
      await context.catalog.reload()
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
