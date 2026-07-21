import { expect, test } from "bun:test"
import { HerdrAgent } from "../src/herdr"

test("R2 starts only with fixed argv and returned authority", async () => {
  const calls: string[][] = []
  const agent = new HerdrAgent(async (argv) => {
    calls.push(argv)
    return { code: 0, stdout: JSON.stringify({ type: "agent_started", agent: { name: "job", terminal_id: "t1", pane_id: "p1", cwd: "/repo", workspace_id: "w", tab_id: "tab" }, argv: ["bun", "run"] }) }
  })
  const owned = await agent.start({ name: "job", cwd: "/repo", workspace: "w", tab: "tab", argv: ["bun", "run"] })
  expect(owned.terminalId).toBe("t1")
  expect(calls[0]).toEqual(["herdr", "agent", "start", "job", "--cwd", "/repo", "--workspace", "w", "--tab", "tab", "--split", "right", "--env", expect.stringContaining("OPENCODE_HERDR_JOB="), "--no-focus", "--", "bun", "run"])
})

test("R2 rejects forged start responses", async () => {
  const agent = new HerdrAgent(async () => ({ code: 0, stdout: '{"type":"agent_started","agent":{"name":"other","terminal_id":"t","pane_id":"p"},"argv":[]}' }))
  await expect(agent.start({ name: "job", cwd: "/repo", workspace: "w", tab: "tab", argv: ["bun"] })).rejects.toThrow("mismatched")
})

test("R7 cancellation never closes a foreign pane", async () => {
  const calls: string[][] = []
  const agent = new HerdrAgent(async (argv) => { calls.push(argv); return { code: 0, stdout: "{}" } })
  await agent.cancel({ terminalId: "t1", paneId: "p1" })
  expect(calls).toEqual([["herdr", "agent", "send", "t1", "\u0003"], ["herdr", "agent", "wait", "t1", "--status", "idle", "--timeout", "60000"], ["herdr", "pane", "close", "p1"]])
})
