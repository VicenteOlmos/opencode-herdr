import { HerdrError } from "./errors.js"
export type Run = (argv: string[]) => Promise<{ code: number; stdout: string; stderr?: string }>
export type OwnedAgent = { terminalId: string; paneId: string }
export type AgentState = OwnedAgent & { status: "done" | "idle" | "working" | "cancelled" }
export class HerdrAgent {
  constructor(private readonly run: Run = async (argv) => { const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: process.env }); return { code: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() } }) {}
  async start(input: { name: string; cwd: string; workspace: string; tab: string; argv: string[]; job?: string }): Promise<OwnedAgent> {
    if (!/^[a-zA-Z0-9._-]+$/.test(input.name) || !input.argv.length) throw new HerdrError("unsafe agent input")
    const argv = ["herdr", "agent", "start", input.name, "--cwd", input.cwd, "--workspace", input.workspace, "--tab", input.tab, "--split", "right", "--env", `OPENCODE_HERDR_JOB=${input.job ?? ""}`, "--no-focus", "--", ...input.argv]
    const result = await this.run(argv); if (result.code !== 0) throw new HerdrError("agent start failed")
    let parsed: any; try { parsed = JSON.parse(result.stdout) } catch { throw new HerdrError("invalid agent start response") }
    const agent = parsed?.agent
    if (parsed?.type !== "agent_started" || agent?.name !== input.name || agent?.cwd !== input.cwd || agent?.workspace_id !== input.workspace || agent?.tab_id !== input.tab || !agent?.terminal_id || !agent?.pane_id || JSON.stringify(parsed.argv) !== JSON.stringify(input.argv)) throw new HerdrError("mismatched agent start response")
    return { terminalId: agent.terminal_id, paneId: agent.pane_id }
  }
  async cancel(agent: OwnedAgent) { await this.run(["herdr", "agent", "send", agent.terminalId, "\u0003"]); await this.wait(agent, "idle"); await this.run(["herdr", "pane", "close", agent.paneId]) }
  async close(agent: OwnedAgent) { await this.run(["herdr", "pane", "close", agent.paneId]) }
  async wait(agent: OwnedAgent, status: "idle" | "working", timeout = 60_000) { const result = await this.run(["herdr", "agent", "wait", agent.terminalId, "--status", status, "--timeout", String(timeout)]); if (result.code !== 0) throw new HerdrError(`agent did not reach ${status}`) }
  async get(agent: OwnedAgent): Promise<AgentState> {
    const result = await this.run(["herdr", "agent", "get", agent.terminalId])
    if (result.code !== 0) throw new HerdrError("agent get failed")
    let state: any; try { state = JSON.parse(result.stdout) } catch { throw new HerdrError("invalid agent get response") }
    if (state?.terminal_id !== agent.terminalId || state?.pane_id !== agent.paneId || !["done", "idle", "working", "cancelled"].includes(state?.status)) throw new HerdrError("mismatched agent get response")
    return { terminalId: state.terminal_id, paneId: state.pane_id, status: state.status }
  }
  async read(agent: OwnedAgent) { const result = await this.run(["herdr", "agent", "read", agent.terminalId, "--source", "recent", "--lines", "20"]); if (result.code !== 0) throw new HerdrError("agent read failed"); return result.stdout }
  async send(agent: OwnedAgent, text: string) { const result = await this.run(["herdr", "agent", "send", agent.terminalId, text]); if (result.code !== 0) throw new HerdrError("agent send failed") }
}
