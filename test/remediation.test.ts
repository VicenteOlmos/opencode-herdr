import { expect, test } from "bun:test"
import { createHerdr } from "../src/provider"
import { HerdrController } from "../src/controller"
import { HerdrPlugin } from "../src/index"

const target = { id: "cursor-agent", name: "Cursor agent", adapter: "cursor", nativeModel: "agent", provenance: "verified" as const, limits: { context: 1, output: 1 }, toolCall: false as const, toolMode: "delegated-agent" as const }

test("5.1/5.3 selected model uses agent lifecycle and validated result", async () => {
  const calls: string[][] = []
  const controller = new HerdrController({ root: "/tmp", cwd: "/repo", workspace: "w", tab: "tab", run: async (argv) => {
    calls.push(argv)
    if (argv[2] === "start") return { code: 0, stdout: JSON.stringify({ type: "agent_started", agent: { name: argv[3], terminal_id: "t", pane_id: "p", cwd: "/repo", workspace_id: "w", tab_id: "tab" }, argv: argv.slice(argv.indexOf("--") + 1) }) }
    if (argv[2] === "get") return { code: 0, stdout: JSON.stringify({ terminal_id: "t", pane_id: "p", status: "done" }) }
    return { code: 0, stdout: "{}" }
  }, result: async (job, selected) => ({ schemaVersion: 1, jobId: job.id, targetId: selected.id, status: "done", text: "ok", delegatedTools: false }) })
  const model = createHerdr({ targets: [target], controller }).languageModel(target.id)
  expect((await model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "safe $(x)" }] }] } as any)).content).toEqual([{ type: "text", text: "ok" }])
  expect(calls.some((argv) => argv[2] === "start" && argv.includes("--"))).toBeTrue()
  expect(calls.map((argv) => argv[2])).toEqual(["start", "wait", "send", "wait", "wait", "get", "read", "close"])
})

test("5.4 does not advertise or accept OpenCode tools without structured adapter support", async () => {
  const model = createHerdr({ targets: [target], execute: async () => ({ schemaVersion: 1, jobId: "j", targetId: target.id, status: "done", text: "ok", delegatedTools: false }) }).languageModel(target.id)
  const value = await model.doGenerate({ prompt: [], tools: [{ type: "function", name: "unsafe", inputSchema: {} }] } as any)
  expect(value.warnings).toHaveLength(1)
})

test("5.6 abort and external error never become successful output", async () => {
  const abort = new AbortController(); abort.abort()
  const controller = new HerdrController({ root: "/tmp", cwd: "/repo", workspace: "w", tab: "tab", run: async () => ({ code: 0, stdout: "{}" }) })
  const model = createHerdr({ targets: [target], controller }).languageModel(target.id)
  await expect(model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "x" }] }], abortSignal: abort.signal } as any)).rejects.toThrow("Aborted")
  const errorModel = createHerdr({ targets: [target], execute: async () => ({ schemaVersion: 1, jobId: "j", targetId: target.id, status: "error", diagnostic: "token=secret", delegatedTools: false }) }).languageModel(target.id)
  await expect(errorModel.doGenerate({ prompt: [] } as any)).rejects.toThrow("[redacted]")
})

test("5.2 plugin registers usable capability and pane tools", async () => {
  const previous = { workspace: process.env.HERDR_WORKSPACE_ID, tab: process.env.HERDR_TAB_ID, pane: process.env.HERDR_PANE_ID }
  process.env.HERDR_WORKSPACE_ID = "w"; process.env.HERDR_TAB_ID = "t"; process.env.HERDR_PANE_ID = "p"
  const hooks: any = await HerdrPlugin.server({ directory: "/tmp" } as any)
  expect(hooks.tool.herdr_capabilities).toBeDefined()
  expect(hooks.tool.herdr_pane).toBeDefined()
  await hooks.config({})
  expect(await hooks.tool.herdr_capabilities.execute({}, {})).toBeString()
  await expect(hooks.tool.herdr_pane.execute({ target: "missing", task: "x" }, {})).rejects.toThrow("unavailable")
  Object.assign(process.env, { HERDR_WORKSPACE_ID: previous.workspace, HERDR_TAB_ID: previous.tab, HERDR_PANE_ID: previous.pane })
})
