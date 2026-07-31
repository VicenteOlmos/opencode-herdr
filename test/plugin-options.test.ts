import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import { resolvePluginOptions } from "../src/plugin-options"
import { HerdrController } from "../src/controller"
import { createHerdr } from "../src/provider"
import { HerdrPlugin } from "../src/index"
import { HerdrPool, JOB_PANE_PREFIX } from "../src/pool"
import { AbortError } from "../src/errors"
import type { Target } from "../src/adapters/types"
import type { Job, JobResultV1 } from "../src/job"

const target = {
  id: "cursor-agent",
  name: "Cursor agent",
  adapter: "cursor",
  nativeModel: "agent",
  provenance: "verified" as const,
  limits: { context: 1, output: 1 },
  toolCall: false as const,
}

type ReleaseRecord = { jobId: string; status: string; closePane?: boolean }

class TrackingPool extends HerdrPool {
  releases: ReleaseRecord[] = []
  override async release(jobId: string, opts: { closePane?: boolean; status?: "running" | "done" | "error" | "cancelled" } = {}) {
    this.releases.push({ jobId, status: opts.status ?? "done", closePane: opts.closePane })
    return super.release(jobId, opts)
  }
}

function poolMock(calls: string[][], extra?: { failReportWorking?: boolean; failPaneRun?: boolean; failRelease?: boolean }) {
  return async (argv: string[]) => {
    calls.push(argv)
    if (extra?.failReportWorking && argv[2] === "report-agent" && argv.includes("working")) {
      return { code: 1, stdout: "", stderr: "unsupported" }
    }
    if (extra?.failPaneRun && argv[1] === "pane" && argv[2] === "run") {
      return { code: 1, stdout: "", stderr: "run failed" }
    }
    if (extra?.failRelease && argv[1] === "pane" && argv[2] === "close") {
      throw new Error("release close failed")
    }
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

function lifecyclePhases(calls: string[][]) {
  return calls
    .filter((argv) => argv[1] === "pane" && ["report-agent", "release-agent", "close"].includes(argv[2] ?? ""))
    .map((argv) => {
      if (argv[2] === "report-agent") return `report:${argv.at(-1)}`
      if (argv[2] === "release-agent") return "release-agent"
      return "pane-close"
    })
}

async function runController(opts: {
  calls: string[][]
  result: (job: Job, selected: Target) => Promise<JobResultV1>
  keepPanes?: boolean
  abort?: AbortSignal
  resultTimeoutMs?: number
  pool?: TrackingPool
  runExtra?: Parameters<typeof poolMock>[1]
}) {
  const root = await mkdtemp("/tmp/herdr-ctl-")
  const pool = opts.pool ?? new TrackingPool({ run: poolMock(opts.calls, opts.runExtra) })
  const controller = new HerdrController({
    root,
    cwd: "/repo",
    workspace: "w",
    tab: "tab",
    keepPanes: opts.keepPanes,
    run: poolMock(opts.calls, opts.runExtra),
    pool,
    result: opts.result,
    resultTimeoutMs: opts.resultTimeoutMs,
  })
  const model = createHerdr({ targets: [target], controller }).languageModel(target.id)
  const generate = model.doGenerate({
    prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    abortSignal: opts.abort,
  } as any)
  return { pool, root, generate }
}

test("resolvePluginOptions debug implies keepPanes+keepJobs", () => {
  const prevDebug = process.env.OPENCODE_HERDR_DEBUG
  const prevPanes = process.env.OPENCODE_HERDR_KEEP_PANES
  const prevJobs = process.env.OPENCODE_HERDR_KEEP_JOBS
  delete process.env.OPENCODE_HERDR_DEBUG
  delete process.env.OPENCODE_HERDR_KEEP_PANES
  delete process.env.OPENCODE_HERDR_KEEP_JOBS
  try {
    expect(resolvePluginOptions({ debug: true })).toEqual({
      debug: true,
      keepPanes: true,
      keepJobs: true,
      handoverDefault: undefined,
    })
    expect(resolvePluginOptions({ keepPanes: true })).toMatchObject({ keepPanes: true, keepJobs: false, debug: false })
    expect(resolvePluginOptions({ handoverDefault: "cursor" }).handoverDefault).toBe("cursor")
  } finally {
    if (prevDebug === undefined) delete process.env.OPENCODE_HERDR_DEBUG
    else process.env.OPENCODE_HERDR_DEBUG = prevDebug
    if (prevPanes === undefined) delete process.env.OPENCODE_HERDR_KEEP_PANES
    else process.env.OPENCODE_HERDR_KEEP_PANES = prevPanes
    if (prevJobs === undefined) delete process.env.OPENCODE_HERDR_KEEP_JOBS
    else process.env.OPENCODE_HERDR_KEEP_JOBS = prevJobs
  }
})

test("controller keepPanes/keepJobs skips close and job rm", async () => {
  const root = await mkdtemp("/tmp/herdr-keep-")
  const calls: string[][] = []
  let jobDir = ""
  const controller = new HerdrController({
    root,
    cwd: "/repo",
    workspace: "w",
    tab: "tab",
    keepPanes: true,
    keepJobs: true,
    run: poolMock(calls),
    result: async (job, selected) => {
      jobDir = job.dir
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
  const model = createHerdr({ targets: [target], controller }).languageModel(target.id)
  expect((await model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any)).content)
    .toEqual([{ type: "text", text: "ok" }])
  expect(calls.some((argv) => argv[1] === "pane" && argv[2] === "close")).toBeFalse()
  expect(calls.some((argv) => argv[1] === "pane" && argv[2] === "rename" && argv.some((a) => a.startsWith(JOB_PANE_PREFIX)))).toBeTrue()
  expect(existsSync(jobDir)).toBeTrue()
})

test("controller reports working after successful start", async () => {
  const calls: string[][] = []
  const { generate } = await runController({
    calls,
    result: async (job, selected) => ({
      schemaVersion: 1,
      jobId: job.id,
      targetId: selected.id,
      status: "done",
      text: "ok",
      delegatedTools: false,
    }),
  })
  await generate
  const working = calls.find((argv) => argv[2] === "report-agent" && argv.includes("working"))
  expect(working).toEqual(["herdr", "pane", "report-agent", "w:pJob", "--source", "opencode-herdr", "--agent", expect.stringMatching(/^oh-/), "--state", "working"])
})

test("controller maps terminal outcomes independently", async () => {
  const doneCalls: string[][] = []
  const donePool = new TrackingPool({ run: poolMock(doneCalls) })
  const doneController = new HerdrController({
    root: await mkdtemp("/tmp/herdr-done-"),
    cwd: "/repo",
    workspace: "w",
    run: poolMock(doneCalls),
    pool: donePool,
    result: async (job, selected) => ({
      schemaVersion: 1,
      jobId: job.id,
      targetId: selected.id,
      status: "done",
      text: "ok",
      delegatedTools: false,
    }),
  })
  await doneController.execute(target, { prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any)
  expect(donePool.releases.at(-1)?.status).toBe("done")

  for (const status of ["error", "cancelled"] as const) {
    const calls: string[][] = []
    const pool = new TrackingPool({ run: poolMock(calls) })
    const controller = new HerdrController({
      root: await mkdtemp(`/tmp/herdr-${status}-`),
      cwd: "/repo",
      workspace: "w",
      run: poolMock(calls),
      pool,
      result: async (job, selected) => ({
        schemaVersion: 1,
        jobId: job.id,
        targetId: selected.id,
        status,
        diagnostic: status === "error" ? "boom" : undefined,
        delegatedTools: false,
      }),
    })
    await controller.execute(target, { prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any)
    expect(pool.releases.at(-1)?.status).toBe(status)
  }

  const timeoutCalls: string[][] = []
  const timeoutPool = new TrackingPool({ run: poolMock(timeoutCalls) })
  const timeoutController = new HerdrController({
    root: await mkdtemp("/tmp/herdr-timeout-"),
    cwd: "/repo",
    workspace: "w",
    run: poolMock(timeoutCalls),
    pool: timeoutPool,
    resultTimeoutMs: 50,
    result: async () => { throw new Error("no result yet") },
  })
  await expect(timeoutController.execute(target, { prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any)).rejects.toThrow("timeout")
  expect(timeoutPool.releases.at(-1)?.status).toBe("error")

  const abortCalls: string[][] = []
  const abortPool = new TrackingPool({ run: poolMock(abortCalls) })
  const abort = new AbortController()
  let waits = 0
  const abortController = new HerdrController({
    root: await mkdtemp("/tmp/herdr-abort-"),
    cwd: "/repo",
    workspace: "w",
    run: poolMock(abortCalls),
    pool: abortPool,
    result: async () => {
      waits++
      if (waits === 1) abort.abort()
      throw new Error("no result yet")
    },
    resultTimeoutMs: 5_000,
  })
  await expect(abortController.execute(target, { prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }], abortSignal: abort.signal } as any)).rejects.toBeInstanceOf(AbortError)
  expect(abortPool.releases.at(-1)?.status).toBe("cancelled")
})

test("controller finalizes idle then release-agent then pool release", async () => {
  const calls: string[][] = []
  const pool = new TrackingPool({ run: poolMock(calls) })
  const { generate } = await runController({
    calls,
    pool,
    result: async (job, selected) => ({
      schemaVersion: 1,
      jobId: job.id,
      targetId: selected.id,
      status: "done",
      text: "ok",
      delegatedTools: false,
    }),
  })
  await generate
  const phases = lifecyclePhases(calls)
  const idleIdx = phases.indexOf("report:idle")
  const releaseIdx = phases.indexOf("release-agent")
  const closeIdx = phases.indexOf("pane-close")
  expect(idleIdx).toBeGreaterThanOrEqual(0)
  expect(releaseIdx).toBeGreaterThan(idleIdx)
  expect(closeIdx).toBeGreaterThan(releaseIdx)
  expect(pool.releases).toHaveLength(1)
})

test("working report failure preserves result and still cleans up", async () => {
  const calls: string[][] = []
  const pool = new TrackingPool({ run: poolMock(calls, { failReportWorking: true }) })
  const controller = new HerdrController({
    root: await mkdtemp("/tmp/herdr-report-fail-"),
    cwd: "/repo",
    workspace: "w",
    run: poolMock(calls, { failReportWorking: true }),
    pool,
    result: async (job, selected) => ({
      schemaVersion: 1,
      jobId: job.id,
      targetId: selected.id,
      status: "error",
      diagnostic: "runner failed",
      delegatedTools: false,
    }),
  })
  const result = await controller.execute(target, { prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any)
  expect(result).toMatchObject({ status: "error", diagnostic: "runner failed" })
  expect(pool.releases.at(-1)?.status).toBe("error")
  expect(calls.some((argv) => argv[2] === "release-agent")).toBeTrue()
})

test("launch error retains no working claim and preserves primary error", async () => {
  const calls: string[][] = []
  const pool = new TrackingPool({ run: poolMock(calls, { failPaneRun: true, failRelease: true }) })
  const controller = new HerdrController({
    root: await mkdtemp("/tmp/herdr-launch-"),
    cwd: "/repo",
    workspace: "w",
    run: poolMock(calls, { failPaneRun: true, failRelease: true }),
    pool,
    result: async () => ({
      schemaVersion: 1,
      jobId: "unused",
      targetId: target.id,
      status: "done",
      text: "ok",
      delegatedTools: false,
    }),
  })
  await expect(controller.execute(target, { prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any)).rejects.toThrow("pane run failed")
  expect(calls.some((argv) => argv[2] === "report-agent" && argv.includes("working"))).toBeFalse()
  expect(pool.releases).toHaveLength(1)
  expect(pool.releases[0]?.status).toBe("error")
})

test("server registers no session-lifecycle toast hook and ignores non-Herdr commands", async () => {
  const root = await mkdtemp("/tmp/herdr-no-toast-")
  const toasts: unknown[] = []
  const mockContext = {
    directory: root,
    client: {
      tui: {
        showToast: async (input: unknown) => { toasts.push(input) },
      },
      session: {
        prompt: async () => {},
      },
    },
  }
  const hooks = await HerdrPlugin.server(mockContext as any, undefined)

  // R1/R3: session-lifecycle hook must not be registered
  expect(hooks.event).toBeUndefined()

  // Guard: if an event hook were present (pre-removal code), session.created must not toast
  if (typeof (hooks as any).event === "function") {
    await (hooks as any).event({
      event: { type: "session.created", properties: { info: { id: "s1" } } },
    })
    expect(toasts).toHaveLength(0)
  }

  // R4: non-Herdr command must not fire any Herdr toast
  const cmdBefore = hooks["command.execute.before"]
  expect(cmdBefore).toBeDefined()
  const nonHerdrOutput = { parts: [{ type: "text", text: "x" }] }
  await cmdBefore!(
    { command: "summarize", sessionID: "s1", arguments: "" } as any,
    nonHerdrOutput as any,
  )
  expect(toasts).toHaveLength(0)
})
