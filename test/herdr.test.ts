import { expect, test } from "bun:test"
import { HerdrAgent } from "../src/herdr"
import { herdrAgentName, HerdrPool, JOB_PANE_PREFIX } from "../src/pool"

test("herdrAgentName sanitizes to herdr rules", () => {
  expect(herdrAgentName("HandOver-ABC_123")).toMatch(/^oh-[a-z0-9_-]+$/)
  expect(herdrAgentName("X".repeat(80)).length).toBeLessThanOrEqual(32)
})

test("startKind uses --kind --pane and --until wait", async () => {
  const calls: string[][] = []
  const agent = new HerdrAgent(async (argv) => {
    calls.push(argv)
    if (argv[1] === "agent" && argv[2] === "start") {
      return {
        code: 0,
        stdout: JSON.stringify({
          id: "cli:agent:start",
          result: { type: "agent_started", agent: { name: "oh-job", terminal_id: "t1", pane_id: "p-job", agent_status: "idle" } },
        }),
      }
    }
    return { code: 0, stdout: "{}" }
  })
  const owned = await agent.startKind({ name: "job", kind: "claude", paneId: "p-job", args: [] })
  expect(owned).toEqual({ terminalId: "t1", paneId: "p-job", name: expect.stringMatching(/^oh-/) })
  expect(calls[0]).toEqual(["herdr", "agent", "start", expect.stringMatching(/^oh-/), "--kind", "claude", "--pane", "p-job"])
  await agent.wait(owned, ["idle"])
  expect(calls[1]).toEqual(["herdr", "agent", "wait", "p-job", "--timeout", "60000", "--until", "idle"])
})

test("startJob acquires pool pane and runs argv", async () => {
  const calls: string[][] = []
  const run = async (argv: string[]) => {
    calls.push(argv)
    if (argv[1] === "tab" && argv[2] === "list") {
      return { code: 0, stdout: JSON.stringify({ result: { type: "tab_list", tabs: [{ tab_id: "w:tH", workspace_id: "w", label: "opencode-herdr", pane_count: 1 }] } }) }
    }
    if (argv[1] === "pane" && argv[2] === "list") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            type: "pane_list",
            panes: [
              { pane_id: "w:pSeed", tab_id: "w:tH", workspace_id: "w", terminal_id: "term-seed" },
              ...[...Array.from({ length: calls.filter((c) => c[2] === "split").length })].map((_, i) => ({
                pane_id: `w:pJob${i}`,
                tab_id: "w:tH",
                workspace_id: "w",
                terminal_id: `term-job${i}`,
                label: `${JOB_PANE_PREFIX}abc`,
              })),
            ],
          },
        }),
      }
    }
    if (argv[1] === "pane" && argv[2] === "split") {
      return {
        code: 0,
        stdout: JSON.stringify({ result: { type: "pane_created", pane: { pane_id: "w:pNew", terminal_id: "term-new", tab_id: "w:tH" } } }),
      }
    }
    return { code: 0, stdout: "{}" }
  }
  const pool = new HerdrPool({ run, acquireTimeoutMs: 2_000 })
  const agent = new HerdrAgent(run)
  const owned = await agent.startJob({
    jobId: "11111111-2222-3333-4444-555555555555",
    cwd: "/repo",
    workspace: "w",
    argv: ["bun", "runner.ts", "/tmp/job"],
    env: { OPENCODE_HERDR_JOB: "/tmp/job" },
    pool,
  })
  expect(owned.paneId).toBe("w:pNew")
  expect(owned.terminalId).toBe("term-new")
  expect(calls.some((c) => c[1] === "pane" && c[2] === "run" && c.includes("bun"))).toBeTrue()
  expect(pool.get(owned.jobId!)?.status).toBe("running")
})

test("pool rejects when tab is full", async () => {
  let splits = 0
  const run = async (argv: string[]) => {
    if (argv[1] === "tab" && argv[2] === "list") {
      return { code: 0, stdout: JSON.stringify({ result: { tabs: [{ tab_id: "w:tH", workspace_id: "w", label: "opencode-herdr" }] } }) }
    }
    if (argv[1] === "pane" && argv[2] === "list") {
      const jobPanes = Array.from({ length: 4 }, (_, i) => ({
        pane_id: `w:p${i}`,
        tab_id: "w:tH",
        workspace_id: "w",
        terminal_id: `t${i}`,
        label: `${JOB_PANE_PREFIX}${i}`,
      }))
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            panes: [{ pane_id: "w:seed", tab_id: "w:tH", workspace_id: "w", terminal_id: "ts" }, ...jobPanes],
          },
        }),
      }
    }
    if (argv[2] === "split") splits++
    return { code: 0, stdout: "{}" }
  }
  const pool = new HerdrPool({ run, acquireTimeoutMs: 800 })
  await expect(pool.acquire({ jobId: "job-x", workspaceId: "w", cwd: "/repo" })).rejects.toThrow("full")
  expect(splits).toBe(0)
})

test("cancel uses send-keys and wait --until", async () => {
  const calls: string[][] = []
  const agent = new HerdrAgent(async (argv) => {
    calls.push(argv)
    return { code: 0, stdout: "{}" }
  })
  await agent.cancel({ terminalId: "t1", paneId: "p1" })
  expect(calls[0]).toEqual(["herdr", "pane", "send-keys", "p1", "ctrl+c"])
  expect(calls[1]?.slice(0, 4)).toEqual(["herdr", "agent", "wait", "p1"])
  expect(calls[1]).toContain("--until")
  expect(calls.at(-1)).toEqual(["herdr", "pane", "close", "p1"])
})
