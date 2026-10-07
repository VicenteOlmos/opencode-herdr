import { expect, setDefaultTimeout, test } from "bun:test"
setDefaultTimeout(30_000)
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createHerdr } from "../src/provider"
import { HerdrController } from "../src/controller"
import { HerdrPlugin } from "../src/index"
import { JOB_PANE_PREFIX } from "../src/pool"
import { createV2Context } from "./v2-context"

const target = { id: "cursor-agent", name: "Cursor agent", adapter: "cursor", nativeModel: "agent", provenance: "verified" as const, limits: { context: 1, output: 1 }, toolCall: false as const, toolMode: "delegated-agent" as const }

function poolMock(calls: string[][]) {
  return async (argv: string[]) => {
    calls.push(argv)
    if (argv[1] === "tab" && argv[2] === "list") {
      return { code: 0, stdout: JSON.stringify({ result: { tabs: [{ tab_id: "w:tH", workspace_id: "w", label: "opencode-herdr", pane_count: 1 }] } }) }
    }
    if (argv[1] === "pane" && argv[2] === "list") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            panes: [{ pane_id: "w:seed", tab_id: "w:tH", workspace_id: "w", terminal_id: "term-seed" }],
          },
        }),
      }
    }
    if (argv[1] === "pane" && argv[2] === "split") {
      return {
        code: 0,
        stdout: JSON.stringify({ result: { pane: { pane_id: "w:pJob", terminal_id: "term-job", tab_id: "w:tH" } } }),
      }
    }
    return { code: 0, stdout: "{}" }
  }
}

test("5.1/5.3 selected model uses herdr tab pool and validated result", async () => {
  const calls: string[][] = []
  const controller = new HerdrController({
    root: "/tmp",
    cwd: "/repo",
    workspace: "w",
    tab: "tab",
    run: poolMock(calls),
    result: async (job, selected) => ({
      schemaVersion: 1,
      jobId: job.id,
      targetId: selected.id,
      status: "done",
      text: "ok",
      delegatedTools: false,
    }),
  })
  const model = createHerdr({ targets: [target], controller }).languageModel(target.id)
  expect((await model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "safe $(x)" }] }] } as any)).content).toEqual([{ type: "text", text: "ok" }])
  expect(calls.some((argv) => argv[1] === "pane" && argv[2] === "run" && argv.some((a) => a.includes("runner.ts")))).toBeTrue()
  expect(calls.some((argv) => argv[1] === "pane" && argv[2] === "split")).toBeTrue()
  expect(calls.some((argv) => argv[1] === "pane" && argv[2] === "rename" && argv.some((a) => a.startsWith(JOB_PANE_PREFIX)))).toBeTrue()
  expect(calls.some((argv) => argv[1] === "pane" && argv[2] === "close")).toBeTrue()
})

test("selected V2 effort reaches the controller job request", async () => {
  const calls: string[][] = []
  let requestEffort: unknown
  const controller = new HerdrController({
    root: "/tmp",
    cwd: "/repo",
    workspace: "w",
    tab: "tab",
    run: poolMock(calls),
    result: async (job, selected) => {
      requestEffort = JSON.parse(await readFile(job.request, "utf8")).effort
      return {
        schemaVersion: 1,
        jobId: job.id,
        targetId: selected.id,
        status: "done",
        text: "ok",
        delegatedTools: false,
      }
    },
  })
  const model = createHerdr({ targets: [{ ...target, efforts: ["low", "high"] }], controller }).languageModel(target.id, "high")
  await model.doGenerate({
    prompt: [{ role: "user", content: [{ type: "text", text: "use high effort" }] }],
  })
  expect(requestEffort).toBe("high")
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
  const { registrations, cleanup } = await createV2Context(HerdrPlugin)
  try {
    const capabilities = registrations.tools.find((tool: any) => tool.name === "herdr_capabilities") as any
    const pane = registrations.tools.find((tool: any) => tool.name === "herdr_pane") as any
    expect(capabilities).toBeDefined()
    expect(pane).toBeDefined()
    expect((await capabilities.execute()).content).toContain("cursor/agent")
    await expect(pane.execute({ runtime: "missing", task: "x" })).rejects.toThrow("unknown runtime")
  } finally {
    await cleanup()
  }
})
