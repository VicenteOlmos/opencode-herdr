import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createHerdr } from "../src/provider"
import { HerdrController } from "../src/controller"
import { targetId } from "../src/adapters/types"

const root = await mkdtemp("/tmp/opencode-herdr-smoke-")
const bin = join(root, "bin")
await Bun.$`mkdir -p ${bin}`
const fake = join(bin, "herdr")
await writeFile(
  fake,
  `#!/usr/bin/env bun
const a = process.argv.slice(2)
if (a[0] === "tab" && a[1] === "list") {
  console.log(JSON.stringify({ result: { tabs: [{ tab_id: "w:tH", workspace_id: "w", label: "opencode-herdr" }] } }))
} else if (a[0] === "pane" && a[1] === "list") {
  console.log(JSON.stringify({ result: { panes: [{ pane_id: "w:seed", tab_id: "w:tH", workspace_id: "w", terminal_id: "term-seed" }] } }))
} else if (a[0] === "pane" && a[1] === "split") {
  console.log(JSON.stringify({ result: { pane: { pane_id: "w:pJob", terminal_id: "term-job", tab_id: "w:tH" } } }))
} else if (a[0] === "pane" && a[1] === "run") {
  const argv = a.slice(3)
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: process.env })
  await child.exited
  console.log("{}")
} else if (a[0] === "pane" && a[1] === "rename") {
  console.log("{}")
} else if (a[0] === "pane" && a[1] === "close") {
  console.log("{}")
} else console.log("{}")
`,
)
await chmod(fake, 0o755)
const agentBin = join(bin, "agent")
await writeFile(agentBin, "#!/bin/sh\nprintf '%s\\n' '{\"type\":\"result\",\"result\":\"fake runtime ok\"}'\n")
await chmod(agentBin, 0o755)
const prior = process.env.PATH
process.env.PATH = `${bin}:${prior}`
try {
  const target: any = {
    id: targetId("cursor", "safe"),
    name: "Cursor",
    adapter: "cursor",
    nativeModel: "safe",
    provenance: "verified",
    limits: { context: 1, output: 1 },
    toolCall: true,
    toolMode: "delegated-agent",
  }
  const controller = new HerdrController({ root, cwd: root, workspace: "w", tab: "tab", resultTimeoutMs: 15_000 })
  const output: any = await createHerdr({ targets: [target], controller }).languageModel(target.id).doGenerate({
    prompt: [{ role: "user", content: [{ type: "text", text: "safe $task" }] }],
  } as any)
  if (output.content[0]?.text !== "fake runtime ok") throw new Error("fake runtime failed")
  console.log("smoke: herdr tab-pool lifecycle passed")
} finally {
  process.env.PATH = prior
  await rm(root, { recursive: true, force: true })
}
