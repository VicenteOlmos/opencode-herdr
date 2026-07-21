import type { Plugin, PluginModule } from "@opencode-ai/plugin"
import { refreshSnapshot } from "./capabilities.js"
import { injectConfig } from "./opencode-config.js"
import { herdrTools } from "./command.js"
import { HerdrController } from "./controller.js"
import { HerdrError } from "./errors.js"
import { join } from "node:path"
export { createHerdr } from "./provider.js"

const run = async (argv: string[]) => { const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" }); return { code: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() } }
const server: Plugin = async (context) => {
  let targets: import("./adapters/types.js").Target[] = []
  let herdr = false
  const runtime = () => {
    const workspace = process.env.HERDR_WORKSPACE_ID, tab = process.env.HERDR_TAB_ID, pane = process.env.HERDR_PANE_ID
    if (!context.directory.startsWith("/") || !workspace || !tab || !pane || !/^[a-zA-Z0-9._-]+$/.test(workspace) || !/^[a-zA-Z0-9._-]+$/.test(tab) || !/^[a-zA-Z0-9._-]+$/.test(pane)) throw new HerdrError("valid Herdr runtime context is required")
    return { cwd: context.directory, workspace, tab, pane }
  }
  const controller = () => new HerdrController(runtime())
  const stateDir = join(process.env.XDG_STATE_HOME ?? join(process.env.HOME ?? "/tmp", ".local", "state"), "opencode-herdr")
  const refresh = async () => { const snapshot = await refreshSnapshot(stateDir, { run }); targets = snapshot.targets; herdr = snapshot.herdr }
  return {
    async config(config) { await refresh(); injectConfig(config, targets, runtime()) },
    tool: herdrTools(() => targets, controller, refresh, () => herdr),
  }
}
export const HerdrPlugin: PluginModule = { id: "opencode-herdr", server }
