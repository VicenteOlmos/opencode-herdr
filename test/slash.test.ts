import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { injectConfig } from "../src/opencode-config"
import { bundledSkillPath, installHerdrSkill, opencodeSkillPath } from "../src/skill-install"
import { HandoverAbort } from "../src/errors"
import {
  buildAgentSumPrompt,
  handleHerdrDelete,
  handleHerdrTest,
  probeAgentRoundtrip,
  probeMarker,
  probePaneRoundtrip,
  PROBE_MARKER,
  resolveTestRuntime,
} from "../src/slash"
import { HerdrPool, JOB_PANE_PREFIX } from "../src/pool"
import type { Snapshot } from "../src/capabilities"
import type { SlashDeps } from "../src/slash"

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  herdr: true,
  runtimes: [{ id: "cursor", provenance: "verified" }],
  targets: [{
    id: "cursor/x",
    name: "cursor x",
    adapter: "cursor",
    nativeModel: "x",
    provenance: "verified",
    limits: { context: 1, output: 1 },
    toolCall: false,
  }],
  ...over,
})

const baseDeps = (over: Partial<SlashDeps> = {}): SlashDeps => ({
  snapshot: () => snap(),
  refresh: async () => snap(),
  runtimeCtx: () => ({ cwd: "/tmp", workspace: "w", tab: "t", pane: "p" }),
  run: async () => ({ code: 0, stdout: "{}" }),
  pool: () => new HerdrPool({ run: async () => ({ code: 0, stdout: "{}" }) }),
  directory: "/tmp",
  ...over,
})

test("installHerdrSkill is idempotent", async () => {
  const root = await mkdtemp("/tmp/herdr-skill-install-")
  const previous = { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, HOME: process.env.HOME }
  process.env.XDG_CONFIG_HOME = join(root, "config")
  process.env.HOME = root
  try {
    const bundled = await readFile(bundledSkillPath(), "utf8")
    expect(bundled).toContain("OpenCode plugin commands")
    expect(await installHerdrSkill()).toBe("installed")
    expect(await readFile(opencodeSkillPath(), "utf8")).toBe(bundled)
    expect(await installHerdrSkill()).toBe("unchanged")
    await writeFile(opencodeSkillPath(), "stale")
    expect(await installHerdrSkill()).toBe("installed")
    expect(await readFile(opencodeSkillPath(), "utf8")).toBe(bundled)
  } finally {
    Object.assign(process.env, previous)
    await rm(root, { recursive: true, force: true })
  }
})

test("injectConfig registers herdr slash commands", () => {
  const config: any = {}
  injectConfig(config, [], { cwd: "/tmp", workspace: "w", tab: "t", pane: "p" })
  for (const name of ["herdr-pane", "herdr-handover", "herdr-status", "herdr-test", "herdr-delete"]) {
    expect(config.command[name]?.description).toBeString()
    expect(config.command[name]?.template).toBeString()
  }
  expect(config.command["herdr-test"].description).toContain("random sum")
})

test("resolveTestRuntime prefers handoverDefault when verified", () => {
  expect(resolveTestRuntime(snap({
    runtimes: [
      { id: "cursor", provenance: "verified" },
      { id: "opencode", provenance: "verified" },
    ],
  }), "opencode")).toBe("opencode")
  expect(resolveTestRuntime(snap())).toBe("cursor")
})

test("drainJobPanes closes only oh-* panes in opencode-herdr tab", async () => {
  const calls: string[][] = []
  const run = async (argv: string[]) => {
    calls.push(argv)
    if (argv[1] === "tab" && argv[2] === "list") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            tabs: [
              { tab_id: "w:tH", workspace_id: "w", label: "opencode-herdr" },
              { tab_id: "w:tOther", workspace_id: "w", label: "other" },
            ],
          },
        }),
      }
    }
    if (argv[1] === "pane" && argv[2] === "list") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            panes: [
              { pane_id: "w:seed", tab_id: "w:tH", workspace_id: "w", terminal_id: "ts", label: "seed" },
              { pane_id: "w:job1", tab_id: "w:tH", workspace_id: "w", terminal_id: "t1", label: `${JOB_PANE_PREFIX}abc` },
              { pane_id: "w:job2", tab_id: "w:tH", workspace_id: "w", terminal_id: "t2", label: `${JOB_PANE_PREFIX}def` },
              { pane_id: "w:keep", tab_id: "w:tH", workspace_id: "w", terminal_id: "t3", label: "manual" },
              { pane_id: "w:other", tab_id: "w:tOther", workspace_id: "w", terminal_id: "t4", label: `${JOB_PANE_PREFIX}zzz` },
            ],
          },
        }),
      }
    }
    if (argv[1] === "pane" && argv[2] === "close" && argv[3] === "w:job2") {
      return { code: 1, stdout: "", stderr: "busy" }
    }
    return { code: 0, stdout: "{}" }
  }
  const pool = new HerdrPool({ run })
  const { closed } = await pool.drainJobPanes("w")
  expect(closed).toEqual(["w:job1"])
  expect(calls.filter((c) => c[1] === "pane" && c[2] === "close").map((c) => c[3])).toEqual(["w:job1", "w:job2"])
})

test("handleHerdrTest skips agent probe outside Herdr and still succeeds when smoke ok", async () => {
  const previous = process.env.HERDR_ENV
  delete process.env.HERDR_ENV
  const output = { parts: [{ type: "text", text: "keep" } as any] }
  const toasts: unknown[] = []
  const posts: string[] = []
  try {
    await expect(handleHerdrTest(baseDeps({
      postSession: async (md) => { posts.push(md) },
    }), output, async (toast) => { toasts.push(toast) })).rejects.toBeInstanceOf(HandoverAbort)
    expect(output.parts).toHaveLength(0)
    expect(String((toasts[0] as any)?.message)).toContain("Agent probe:** skipped")
    expect(String((toasts[0] as any)?.message)).toContain("PASS")
    expect((toasts[0] as any)?.variant).toBe("success")
    expect(posts).toHaveLength(1)
    expect(posts[0]).toContain("## Herdr test")
    expect(posts[0]).toContain("PASS")
  } finally {
    if (previous === undefined) delete process.env.HERDR_ENV
    else process.env.HERDR_ENV = previous
  }
})

function agentPoolRunFake(handlers: {
  onClose?: (paneId: string) => void
  a: number
  b: number
  waitOutputFail?: boolean
}) {
  const marker = probeMarker(handlers.a + handlers.b)
  const expectedPrompt = buildAgentSumPrompt(handlers.a, handlers.b)
  return async (argv: string[]) => {
    if (argv[1] === "tab" && argv[2] === "list") {
      return { code: 0, stdout: JSON.stringify({ result: { tabs: [{ tab_id: "w:tH", workspace_id: "w", label: "opencode-herdr" }] } }) }
    }
    if (argv[1] === "pane" && argv[2] === "list") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            panes: [{ pane_id: "w:seed", tab_id: "w:tH", workspace_id: "w", terminal_id: "ts", label: "seed" }],
          },
        }),
      }
    }
    if (argv[1] === "pane" && argv[2] === "split") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            pane: { pane_id: "w:job", tab_id: "w:tH", workspace_id: "w", terminal_id: "tj", label: `${JOB_PANE_PREFIX}probe` },
          },
        }),
      }
    }
    if (argv[1] === "agent" && argv[2] === "start") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            agent: { terminal_id: "term_probe", pane_id: "w:job", agent_status: "idle" },
          },
        }),
      }
    }
    if (argv[1] === "agent" && argv[2] === "wait") {
      expect(argv[3]).toBe("w:job") // pane id, not terminal id
      return { code: 0, stdout: "{}" }
    }
    if (argv[1] === "agent" && argv[2] === "prompt") {
      expect(argv[3]).toBe("w:job")
      expect(argv[4]).toBe(expectedPrompt)
      return { code: 0, stdout: "{}" }
    }
    if (argv[1] === "pane" && argv[2] === "send-keys" && argv[4] === "enter") {
      return { code: 0, stdout: "{}" }
    }
    if (argv[1] === "pane" && argv[2] === "run") {
      expect(argv[4]).toBe(expectedPrompt)
      return { code: 0, stdout: "{}" }
    }
    if (argv[1] === "pane" && argv[2] === "wait-output") {
      if (handlers.waitOutputFail) return { code: 1, stdout: "", stderr: "timeout" }
      expect(argv).toContain(marker)
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            matched_line: marker,
            read: { text: `thinking...\n${marker}\n` },
          },
        }),
      }
    }
    if (argv[1] === "agent" && argv[2] === "read") {
      return { code: 0, stdout: JSON.stringify({ result: { text: `thinking...\n${marker}\n` } }) }
    }
    if (argv[1] === "pane" && argv[2] === "close") {
      handlers.onClose?.(argv[3]!)
      return { code: 0, stdout: "{}" }
    }
    if (argv[1] === "pane" && argv[2] === "rename") return { code: 0, stdout: "{}" }
    return { code: 0, stdout: "{}" }
  }
}

test("probeAgentRoundtrip starts agent, asks sum, reads marker, closes pane", async () => {
  const closes: string[] = []
  const a = 17
  const b = 29
  const run = agentPoolRunFake({ a, b, onClose: (id) => closes.push(id) })
  const pool = new HerdrPool({ run })
  const result = await probeAgentRoundtrip({
    run,
    pool,
    workspace: "w",
    cwd: "/tmp",
    runtime: "cursor",
    a,
    b,
  })
  expect(result.marker).toBe(probeMarker(a + b))
  expect(result.summary).toContain("17+29=46")
  expect(result.steps.some((s) => s.includes("Created pane"))).toBeTrue()
  expect(result.steps.some((s) => s.includes("This OpenCode session read"))).toBeTrue()
  expect(result.snippet).toContain(probeMarker(46))
  expect(closes).toContain("w:job")
})

test("handleHerdrTest agent roundtrip posts narrative into conversation", async () => {
  const previous = process.env.HERDR_ENV
  process.env.HERDR_ENV = "1"
  const closes: string[] = []
  const run = async (argv: string[]) => {
    if (argv[1] === "tab" && argv[2] === "list") {
      return { code: 0, stdout: JSON.stringify({ result: { tabs: [{ tab_id: "w:tH", workspace_id: "w", label: "opencode-herdr" }] } }) }
    }
    if (argv[1] === "pane" && argv[2] === "list") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: { panes: [{ pane_id: "w:seed", tab_id: "w:tH", workspace_id: "w", terminal_id: "ts", label: "seed" }] },
        }),
      }
    }
    if (argv[1] === "pane" && argv[2] === "split") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: { pane: { pane_id: "w:job", tab_id: "w:tH", workspace_id: "w", terminal_id: "tj", label: `${JOB_PANE_PREFIX}probe` } },
        }),
      }
    }
    if (argv[1] === "agent" && argv[2] === "start") {
      return {
        code: 0,
        stdout: JSON.stringify({ result: { agent: { terminal_id: "term_probe", pane_id: "w:job" } } }),
      }
    }
    if (argv[1] === "agent" && argv[2] === "wait") {
      expect(argv[3]).toBe("w:job")
      return { code: 0, stdout: "{}" }
    }
    if (argv[1] === "agent" && argv[2] === "prompt") {
      const text = String(argv[4] ?? "")
      const m = text.match(/Compute (\d+)\+(\d+)/)
      const sum = m ? Number(m[1]) + Number(m[2]) : 7
      ;(run as any)._marker = probeMarker(sum)
      return { code: 0, stdout: "{}" }
    }
    if (argv[1] === "pane" && argv[2] === "send-keys") return { code: 0, stdout: "{}" }
    if (argv[1] === "pane" && argv[2] === "run") {
      const text = String(argv[4] ?? "")
      const m = text.match(/Compute (\d+)\+(\d+)/)
      const sum = m ? Number(m[1]) + Number(m[2]) : 7
      ;(run as any)._marker = probeMarker(sum)
      return { code: 0, stdout: "{}" }
    }
    if (argv[1] === "pane" && argv[2] === "wait-output") {
      const marker = (run as any)._marker ?? probeMarker(7)
      return {
        code: 0,
        stdout: JSON.stringify({
          result: { matched_line: marker, read: { text: `answer\n${marker}\n` } },
        }),
      }
    }
    if (argv[1] === "pane" && argv[2] === "close") {
      closes.push(argv[3]!)
      return { code: 0, stdout: "{}" }
    }
    if (argv[1] === "pane" && argv[2] === "rename") return { code: 0, stdout: "{}" }
    return { code: 0, stdout: "{}" }
  }
  const output = { parts: [] as unknown[] }
  const toasts: unknown[] = []
  const posts: string[] = []
  try {
    await expect(handleHerdrTest(baseDeps({
      run,
      pool: () => new HerdrPool({ run }),
      defaultRuntime: "cursor",
      postSession: async (md) => { posts.push(md) },
    }), output, async (toast) => { toasts.push(toast) })).rejects.toBeInstanceOf(HandoverAbort)
    expect((toasts[0] as any)?.variant).toBe("success")
    expect(String((toasts[0] as any)?.message)).toContain("Agent probe:** ok")
    expect(String((toasts[0] as any)?.message)).toContain("What this session did")
    expect(posts[0]).toContain("Created pane")
    expect(posts[0]).toContain("This OpenCode session read")
    expect(closes).toContain("w:job")
  } finally {
    if (previous === undefined) delete process.env.HERDR_ENV
    else process.env.HERDR_ENV = previous
  }
})

test("handleHerdrTest releases pane when wait-output misses marker", async () => {
  const previous = process.env.HERDR_ENV
  process.env.HERDR_ENV = "1"
  const closes: string[] = []
  const run = agentPoolRunFake({
    a: 2,
    b: 3,
    waitOutputFail: true,
    onClose: (id) => closes.push(id),
  })
  const rand = Math.random
  let n = 0
  Math.random = () => {
    n += 1
    return n === 1 ? 0.03 : 0.055
  }
  const output = { parts: [] as unknown[] }
  const toasts: unknown[] = []
  try {
    await expect(handleHerdrTest(baseDeps({
      run,
      pool: () => new HerdrPool({ run }),
    }), output, async (toast) => { toasts.push(toast) })).rejects.toBeInstanceOf(HandoverAbort)
    expect(closes.length).toBeGreaterThanOrEqual(1)
    expect(String((toasts[0] as any)?.message)).toContain("Agent probe:** failed")
  } finally {
    Math.random = rand
    if (previous === undefined) delete process.env.HERDR_ENV
    else process.env.HERDR_ENV = previous
  }
})

test("probePaneRoundtrip verifies marker from wait-output snapshot", async () => {
  const calls: string[][] = []
  const run = async (argv: string[]) => {
    calls.push(argv)
    if (argv[2] === "run") return { code: 0, stdout: "{}" }
    if (argv[2] === "wait-output") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            matched_line: PROBE_MARKER,
            read: { text: `printf...\n${PROBE_MARKER}\n` },
          },
        }),
      }
    }
    return { code: 0, stdout: "{}" }
  }
  const result = await probePaneRoundtrip(run, "w:p1")
  expect(result.summary).toContain("2+3=5")
  expect(result.matched).toBe(PROBE_MARKER)
  expect(calls.some((c) => c[2] === "run" && String(c[4]).includes("2+3"))).toBeTrue()
  expect(calls.some((c) => c[2] === "wait-output" && c.includes(PROBE_MARKER))).toBeTrue()
})

test("handleHerdrDelete drains oh-* when inside Herdr", async () => {
  const previous = process.env.HERDR_ENV
  process.env.HERDR_ENV = "1"
  const closes: string[] = []
  const run = async (argv: string[]) => {
    if (argv[1] === "tab" && argv[2] === "list") {
      return { code: 0, stdout: JSON.stringify({ result: { tabs: [{ tab_id: "w:tH", workspace_id: "w", label: "opencode-herdr" }] } }) }
    }
    if (argv[1] === "pane" && argv[2] === "list") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            panes: [
              { pane_id: "w:job1", tab_id: "w:tH", workspace_id: "w", terminal_id: "t1", label: `${JOB_PANE_PREFIX}a` },
            ],
          },
        }),
      }
    }
    if (argv[1] === "pane" && argv[2] === "close") {
      closes.push(argv[3]!)
      return { code: 0, stdout: "{}" }
    }
    return { code: 0, stdout: "{}" }
  }
  const output = { parts: [] as unknown[] }
  const toasts: unknown[] = []
  try {
    await expect(handleHerdrDelete(baseDeps({
      run,
      pool: () => new HerdrPool({ run }),
    }), output, async (toast) => { toasts.push(toast) })).rejects.toBeInstanceOf(HandoverAbort)
    expect(closes).toEqual(["w:job1"])
    expect((toasts[0] as any)?.variant).toBe("success")
    expect(String((toasts[0] as any)?.message)).toContain("closed 1")
  } finally {
    if (previous === undefined) delete process.env.HERDR_ENV
    else process.env.HERDR_ENV = previous
  }
})

test("handleHerdrDelete toasts error when runtime context invalid", async () => {
  const previous = process.env.HERDR_ENV
  process.env.HERDR_ENV = "1"
  const output = { parts: [] as unknown[] }
  const toasts: unknown[] = []
  try {
    await expect(handleHerdrDelete(baseDeps({
      runtimeCtx: () => {
        throw new Error("valid Herdr runtime context is required")
      },
    }), output, async (toast) => { toasts.push(toast) })).rejects.toBeInstanceOf(HandoverAbort)
    expect((toasts[0] as any)?.variant).toBe("error")
    expect(String((toasts[0] as any)?.message)).toContain("failed:")
  } finally {
    if (previous === undefined) delete process.env.HERDR_ENV
    else process.env.HERDR_ENV = previous
  }
})
