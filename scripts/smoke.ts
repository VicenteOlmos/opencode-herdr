import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createHerdr } from "../src/provider"
import { HerdrController } from "../src/controller"
import { targetId } from "../src/adapters/types"

const root = await mkdtemp("/tmp/opencode-herdr-smoke-")
const bin = join(root, "bin")
await Bun.$`mkdir -p ${bin}`
const fake = join(bin, "herdr")
const state = join(root, "agent-state.json")
await writeFile(fake, `#!/usr/bin/env bun
const a = process.argv.slice(2); const at = (x) => a[a.indexOf(x)+1];
const state = process.env.FAKE_HERDR_STATE;
if (a[0] === "agent" && a[1] === "start") { const argv = a.slice(a.indexOf("--")+1); await Bun.write(state, JSON.stringify(argv)); console.log(JSON.stringify({type:"agent_started",agent:{name:a[2],terminal_id:"t",pane_id:"p",cwd:at("--cwd"),workspace_id:at("--workspace"),tab_id:at("--tab")},argv})); }
else if (a[0] === "agent" && a[1] === "wait" && at("--status") === "working") { const argv = JSON.parse(await Bun.file(state).text()); const child = Bun.spawn(argv, { stdout:"pipe", stderr:"pipe", env: process.env }); await child.exited; console.log("{}"); }
else if (a[0] === "agent" && a[1] === "get") console.log(JSON.stringify({terminal_id:"t",pane_id:"p",status:"done"}));
else console.log("{}");
`)
await chmod(fake, 0o755)
const agent = join(bin, "agent")
await writeFile(agent, "#!/bin/sh\nprintf '%s\\n' '{\"type\":\"result\",\"result\":\"fake runtime ok\"}'\n")
await chmod(agent, 0o755)
const prior = process.env.PATH
process.env.PATH = `${bin}:${prior}`
process.env.FAKE_HERDR_STATE = state
try {
  const target: any = { id: targetId("cursor", "safe"), name: "Cursor", adapter: "cursor", nativeModel: "safe", provenance: "verified", limits: { context: 1, output: 1 }, toolCall: true, toolMode: "delegated-agent" }
  const controller = new HerdrController({ root, cwd: root, workspace: "w", tab: "tab" })
  const output: any = await createHerdr({ targets: [target], controller }).languageModel(target.id).doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "safe $task" }] }] } as any)
  if (output.content[0]?.text !== "fake runtime ok") throw new Error("fake runtime failed")
  console.log("smoke: fake Herdr lifecycle passed")
} finally {
  process.env.PATH = prior
  delete process.env.FAKE_HERDR_STATE
  await rm(root, { recursive: true, force: true })
}
