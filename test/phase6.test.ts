import { expect, setDefaultTimeout, test } from "bun:test"
setDefaultTimeout(30_000)
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { targetId, type Adapter } from "../src/adapters/types"
import { discover } from "../src/capabilities"
import { HerdrAgent } from "../src/herdr"
import { createJob, readResult } from "../src/job"
import { createLanguageModel } from "../src/language-model"
import { injectConfig } from "../src/opencode-config"
import { HerdrPlugin } from "../src/index"
import { herdrTools } from "../src/command"
import { describeAdapterEvent, finalAssistantText } from "../src/runner"
import { HerdrController, latchTerminal } from "../src/controller"
import { HerdrPool } from "../src/pool"
import { AbortError } from "../src/errors"

const target = { id: "cursor-YWdlbnQ", name: "Cursor agent", adapter: "cursor", nativeModel: "agent", provenance: "verified" as const, limits: { context: 32, output: 8 }, toolCall: false }

test("runner progress lines summarize stream events", () => {
  expect(describeAdapterEvent("cursor", {
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Read", input: { path: "/tmp/x" } }] },
  })).toBe("tool Read: /tmp/x")
  expect(describeAdapterEvent("cursor", {
    type: "assistant",
    message: { content: [{ type: "text", text: "hello world" }] },
  })).toBe("assistant: hello world")
  expect(describeAdapterEvent("codex", { type: "turn.started" })).toBe("turn started")
})

test("R2-001 extracts final assistant text from supported protocols", () => {
  expect(finalAssistantText("cursor", '{"type":"assistant","message":{"content":[{"type":"text","text":"partial"}]}}\n{"type":"result","result":"cursor final"}')).toBe("cursor final")
  expect(finalAssistantText("claude", '{"type":"assistant","message":{"content":[{"type":"text","text":"partial"}]}}\n{"type":"result","result":"claude final"}')).toBe("claude final")
  expect(finalAssistantText("opencode", '{"type":"text","part":{"text":"open"}}\n{"type":"text","part":{"text":"code"}}')).toBe("opencode")
  expect(finalAssistantText("codex", '{"type":"item.completed","item":{"type":"agent_message","text":"codex final"}}')).toBe("codex final")
  expect(() => finalAssistantText("cursor", "{bad")).toThrow("invalid adapter output")
  expect(() => finalAssistantText("claude", "")).toThrow("invalid adapter output")
})

test("6.1 runner CLI writes an atomic validated result", async () => {
  const root = await mkdtemp("/tmp/herdr-runner-")
  const bin = join(root, "bin"), job = await createJob("safe task", root)
  await Bun.$`mkdir -p ${bin}`
  await writeFile(join(bin, "agent"), "#!/bin/sh\nprintf '%s\\n' '{\"type\":\"result\",\"result\":\"runner output\"}'\n")
  await chmod(join(bin, "agent"), 0o755)
  const child = Bun.spawn([Bun.which("bun")!, new URL("../src/runner.ts", import.meta.url).pathname, job.dir, target.id, target.adapter, target.nativeModel], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
  expect(await child.exited).toBe(0)
  expect((await readResult(job, target.id)).text).toBe("runner output")
  await writeFile(join(bin, "agent"), "#!/bin/sh\nprintf '{bad'\n")
  const malformed = await createJob("safe task", root)
  const invalid = Bun.spawn([Bun.which("bun")!, new URL("../src/runner.ts", import.meta.url).pathname, malformed.dir, target.id, target.adapter, target.nativeModel], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
  expect(await invalid.exited).toBe(0)
  expect(await readResult(malformed, target.id)).toMatchObject({ status: "error", diagnostic: "invalid adapter output" })
  await rm(root, { recursive: true, force: true })
})

test("6.2 target IDs are collision-proof and limits come from discovery", async () => {
  expect(targetId("cursor", "a/b")).not.toBe(targetId("cursor", "a-b"))
  const adapter: Adapter = { id: "test", command: ["test"], modelsArg: ["test", "models"], toolCall: false, limits: { context: 1, output: 1 }, parseModels: () => [{ id: "m", limits: { context: 321, output: 123 } }] }
  const snapshot = await discover({ adapters: [adapter], run: async () => ({ code: 0, stdout: "ok" }) })
  expect(snapshot.targets[0]?.limits).toEqual({ context: 321, output: 123 })
})

test("6.3 preserves native finish reasons", async () => {
  const model = createLanguageModel(target, async () => ({ schemaVersion: 1, jobId: "j", targetId: target.id, status: "done", text: "ok", nativeFinish: "length", delegatedTools: false }))
  expect((await model.doGenerate({ prompt: [] } as any)).finishReason).toEqual({ unified: "length", raw: "length" })
})

test("6.4 config load and capability tool refresh the atomic snapshot", async () => {
  const root = await mkdtemp("/tmp/herdr-snapshot-")
  const bin = join(root, "bin")
  await Bun.$`mkdir -p ${bin}`
  for (const name of ["herdr", "agent", "opencode", "claude", "codex"]) {
    const path = join(bin, name)
    await writeFile(path, "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then printf '1.0.0\\n'; else printf '%s' '{\"models\":[\"safe\"]}'; fi\n")
    await chmod(path, 0o755)
  }
  const previous = { PATH: process.env.PATH, XDG_STATE_HOME: process.env.XDG_STATE_HOME, HERDR_WORKSPACE_ID: process.env.HERDR_WORKSPACE_ID, HERDR_TAB_ID: process.env.HERDR_TAB_ID, HERDR_PANE_ID: process.env.HERDR_PANE_ID }
  Object.assign(process.env, { PATH: `${bin}:${process.env.PATH}`, XDG_STATE_HOME: join(root, "state"), HERDR_WORKSPACE_ID: "w", HERDR_TAB_ID: "t", HERDR_PANE_ID: "p" })
  try {
    const hooks: any = await HerdrPlugin.server({ directory: root } as any)
    await hooks.config({})
    await hooks.tool.herdr_capabilities.execute({}, {})
    expect(await Bun.file(join(root, "state", "opencode-herdr", "capabilities-v1.json")).exists()).toBeTrue()
  } finally {
    Object.assign(process.env, previous)
    await rm(root, { recursive: true, force: true })
  }
})

test("6.5 cancel closes owned pane", async () => {
  const calls: string[][] = []
  const agent = new HerdrAgent(async (argv) => {
    calls.push(argv)
    return { code: 0, stdout: argv[2] === "get" ? JSON.stringify({ terminal_id: "t", pane_id: "p", agent_status: "done" }) : "{}" }
  })
  await expect(agent.get({ terminalId: "t", paneId: "wrong" })).rejects.toThrow("mismatched")
  await agent.cancel({ terminalId: "t", paneId: "p" })
  expect(calls.some((a) => a[1] === "pane" && a[2] === "send-keys")).toBeTrue()
  expect(calls.some((a) => a[1] === "agent" && a[2] === "wait" && a.includes("--until"))).toBeTrue()
  expect(calls.at(-1)?.slice(0, 3)).toEqual(["herdr", "pane", "close"])
})

test("6.7 slash harness template distinguishes omitted fields and direct tool data", () => {
  const config: any = {}
  injectConfig(config, [target], { cwd: "/tmp", workspace: "w", tab: "t", pane: "p" })
  expect(config.command["herdr-pane"].template).toContain("no runtime")
  expect(config.command["herdr-pane"].template).toContain("no task")
  expect(config.command["herdr-pane"].template).toContain("both")
  expect(config.command["herdr-pane"].template).toContain("question")
})

test("6.7 direct tool uses explicit validated runtime and task", async () => {
  let received: unknown
  const tools: any = herdrTools(() => [target], () => ({ execute: async (selected: unknown, options: any) => {
    received = { selected, task: options.prompt[0].content[0].text }
    return { status: "done", text: "delegated", delegatedTools: false }
  } }) as any)
  expect(await tools.herdr_pane.execute({ runtime: target.id, task: "safe task" }, {})).toMatchObject({ output: "delegated", metadata: { targetId: target.id } })
  expect(received).toEqual({ selected: target, task: "safe task" })
  expect(await tools.herdr_pane.execute({ runtime: "cursor", task: "via runtime" }, {})).toMatchObject({ output: "delegated", metadata: { runtime: "cursor" } })
})

test("6.8 first terminal latch wins under held cleanup", async () => {
  const terminal = { value: undefined as "done" | "error" | "cancelled" | undefined }
  expect(latchTerminal(terminal, "cancelled")).toBeTrue()
  expect(latchTerminal(terminal, "error")).toBeFalse()
  expect(latchTerminal(terminal, "done")).toBeFalse()
  expect(terminal.value).toBe("cancelled")

  const successFirst = { value: undefined as "done" | "error" | "cancelled" | undefined }
  expect(latchTerminal(successFirst, "done")).toBeTrue()
  expect(latchTerminal(successFirst, "cancelled")).toBeFalse()
  expect(successFirst.value).toBe("done")
})

test("6.9 provider and herdr_pane share controller lifecycle order", async () => {
  const run = async (argv: string[]) => {
    if (argv[1] === "tab" && argv[2] === "list") {
      return { code: 0, stdout: JSON.stringify({ result: { tabs: [{ tab_id: "w:tH", workspace_id: "w", label: "opencode-herdr" }] } }) }
    }
    if (argv[1] === "pane" && argv[2] === "list") {
      return { code: 0, stdout: JSON.stringify({ result: { panes: [{ pane_id: "w:seed", tab_id: "w:tH", workspace_id: "w", terminal_id: "term-seed" }] } }) }
    }
    if (argv[1] === "pane" && argv[2] === "split") {
      return { code: 0, stdout: JSON.stringify({ result: { pane: { pane_id: "w:pJob", terminal_id: "term-job", tab_id: "w:tH" } } }) }
    }
    return { code: 0, stdout: "{}" }
  }
  const providerCalls: string[][] = []
  const providerController = new HerdrController({
    root: await mkdtemp("/tmp/herdr-provider-"),
    cwd: "/repo",
    workspace: "w",
    run: async (argv) => { providerCalls.push(argv); return run(argv) },
    pool: new HerdrPool({ run: async (argv) => { providerCalls.push(argv); return run(argv) } }),
    result: async (job, selected) => ({
      schemaVersion: 1,
      jobId: job.id,
      targetId: selected.id,
      status: "done",
      text: "ok",
      delegatedTools: false,
    }),
  })
  const model = createLanguageModel(target, (input) => providerController.execute(target, input))
  await model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "via provider" }] }] } as any)
  const providerPhases = providerCalls
    .filter((argv) => argv[1] === "pane" && ["report-agent", "release-agent"].includes(argv[2] ?? ""))
    .map((argv) => argv[2])

  const toolCalls: string[][] = []
  const toolController = new HerdrController({
    root: await mkdtemp("/tmp/herdr-tool-"),
    cwd: "/repo",
    workspace: "w",
    run: async (argv) => { toolCalls.push(argv); return run(argv) },
    pool: new HerdrPool({ run: async (argv) => { toolCalls.push(argv); return run(argv) } }),
    result: async (job, selected) => ({
      schemaVersion: 1,
      jobId: job.id,
      targetId: selected.id,
      status: "done",
      text: "ok",
      delegatedTools: false,
    }),
  })
  const tools: any = herdrTools(() => [target], () => toolController as any)
  await tools.herdr_pane.execute({ runtime: target.id, task: "via tool" }, {})
  const toolPhases = toolCalls
    .filter((argv) => argv[1] === "pane" && ["report-agent", "release-agent"].includes(argv[2] ?? ""))
    .map((argv) => argv[2])
  expect(providerPhases).toEqual(["report-agent", "report-agent", "release-agent"])
  expect(toolPhases).toEqual(providerPhases)
})

test("6.10 keepPanes retains pane but releases authority", async () => {
  const calls: string[][] = []
  const run = async (argv: string[]) => {
    calls.push(argv)
    if (argv[1] === "tab" && argv[2] === "list") {
      return { code: 0, stdout: JSON.stringify({ result: { tabs: [{ tab_id: "w:tH", workspace_id: "w", label: "opencode-herdr" }] } }) }
    }
    if (argv[1] === "pane" && argv[2] === "list") {
      return { code: 0, stdout: JSON.stringify({ result: { panes: [{ pane_id: "w:seed", tab_id: "w:tH", workspace_id: "w", terminal_id: "term-seed" }] } }) }
    }
    if (argv[1] === "pane" && argv[2] === "split") {
      return { code: 0, stdout: JSON.stringify({ result: { pane: { pane_id: "w:pJob", terminal_id: "term-job", tab_id: "w:tH" } } }) }
    }
    return { code: 0, stdout: "{}" }
  }
  const controller = new HerdrController({
    root: await mkdtemp("/tmp/herdr-keep-auth-"),
    cwd: "/repo",
    workspace: "w",
    keepPanes: true,
    run,
    pool: new HerdrPool({ run }),
    result: async (job, selected) => ({
      schemaVersion: 1,
      jobId: job.id,
      targetId: selected.id,
      status: "done",
      text: "ok",
      delegatedTools: false,
    }),
  })
  await controller.execute(target, { prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any)
  expect(calls.some((argv) => argv[1] === "pane" && argv[2] === "close")).toBeFalse()
  expect(calls.some((argv) => argv[2] === "release-agent")).toBeTrue()
})
