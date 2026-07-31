import { asRecord, defaultRun, parseCliJson, requireString, type Run } from "./cli.js"
import { HerdrError } from "./errors.js"
import { herdrAgentName, HerdrPool, type JobRecord } from "./pool.js"

export type { Run } from "./cli.js"
export type OwnedAgent = { terminalId: string; paneId: string; tabId?: string; jobId?: string; name?: string }
export type AgentState = OwnedAgent & { status: "done" | "idle" | "working" | "blocked" | "cancelled" | "unknown" }

export type StartKindInput = {
  name: string
  kind: string
  paneId: string
  args?: string[]
  timeoutMs?: number
}

export type ReportedAgentState = "idle" | "working" | "blocked" | "unknown"
export type PaneAgentIdentity = { paneId: string; source: "opencode-herdr"; agent: string }

export type StartJobInput = {
  jobId: string
  cwd: string
  workspace: string
  argv: string[]
  env?: Record<string, string>
  pool: HerdrPool
  closePane?: boolean
}

export function paneAgentIdentity(agent: OwnedAgent, jobId?: string): PaneAgentIdentity {
  return {
    paneId: agent.paneId,
    source: "opencode-herdr",
    agent: agent.name ?? herdrAgentName(jobId ?? agent.jobId ?? "job"),
  }
}

/** Herdr control-plane client (API protocol 17+). */
export class HerdrAgent {
  constructor(private readonly run: Run = defaultRun) {}

  /** Start a supported interactive agent kind in an existing pane. */
  async startKind(input: StartKindInput): Promise<OwnedAgent> {
    const name = herdrAgentName(input.name)
    if (!input.kind.trim() || !input.paneId.trim()) throw new HerdrError("unsafe agent input")
    const args = input.args ?? []
    for (const arg of args) if (/[\n\r\0]/.test(arg)) throw new HerdrError("unsafe agent arg")
    const argv = [
      "herdr", "agent", "start", name,
      "--kind", input.kind,
      "--pane", input.paneId,
      ...(input.timeoutMs ? ["--timeout", String(input.timeoutMs)] : []),
      ...(args.length ? ["--", ...args] : []),
    ]
    const result = await this.run(argv)
    if (result.code !== 0) throw new HerdrError("agent start failed")
    const body = asRecord(parseCliJson(result.stdout))
    const agent = asRecord(body?.agent) ?? body
    if (!agent) throw new HerdrError("invalid agent start response")
    const terminalId = requireString(agent.terminal_id, "terminal_id")
    const paneId = requireString(agent.pane_id, "pane_id")
    if (paneId !== input.paneId) throw new HerdrError("mismatched agent start response")
    return { terminalId, paneId, name }
  }

  /**
   * Acquire a pool pane and run a fixed argv job (opencode-herdr runner).
   * Completion is tracked via the job result file + registry, not agent TUI state.
   */
  async startJob(input: StartJobInput): Promise<OwnedAgent & { record: JobRecord }> {
    if (!input.argv.length) throw new HerdrError("unsafe agent input")
    for (const arg of input.argv) if (/[\n\r\0]/.test(arg)) throw new HerdrError("unsafe agent arg")
    const record = await input.pool.acquire({
      jobId: input.jobId,
      workspaceId: input.workspace,
      cwd: input.cwd,
      env: input.env,
    })
    const result = await this.run(["herdr", "pane", "run", record.paneId, ...input.argv])
    if (result.code !== 0) {
      await input.pool.release(input.jobId, { status: "error", closePane: input.closePane !== false })
      throw new HerdrError("pane run failed")
    }
    return {
      terminalId: record.terminalId,
      paneId: record.paneId,
      tabId: record.tabId,
      jobId: record.jobId,
      name: herdrAgentName(input.jobId),
      record,
    }
  }

  async reportAgent(identity: PaneAgentIdentity, state: ReportedAgentState): Promise<void> {
    await this.run([
      "herdr", "pane", "report-agent", identity.paneId,
      "--source", identity.source,
      "--agent", identity.agent,
      "--state", state,
    ]).catch(() => undefined)
  }

  async releaseAgent(identity: PaneAgentIdentity): Promise<void> {
    await this.run([
      "herdr", "pane", "release-agent", identity.paneId,
      "--source", identity.source,
      "--agent", identity.agent,
    ]).catch(() => undefined)
  }

  async interrupt(agent: OwnedAgent): Promise<void> {
    await this.run(["herdr", "pane", "send-keys", agent.paneId, "ctrl+c"]).catch(() => undefined)
  }

  async cancel(agent: OwnedAgent, pool?: HerdrPool, opts: { closePane?: boolean } = {}) {
    await this.run(["herdr", "pane", "send-keys", agent.paneId, "ctrl+c"]).catch(() => undefined)
    await this.wait(agent, ["idle", "done", "unknown"], 5_000).catch(() => undefined)
    const closePane = opts.closePane !== false
    if (pool && agent.jobId) await pool.release(agent.jobId, { status: "cancelled", closePane })
    else if (closePane) await this.close(agent)
  }

  async close(agent: OwnedAgent) {
    await this.run(["herdr", "pane", "close", agent.paneId])
  }

  /**
   * Herdr agent CLI target: prefer pane id.
   * `terminal_id` often returns agent_not_found even while the agent is listed.
   */
  private target(agent: OwnedAgent) {
    return agent.paneId
  }

  async wait(agent: OwnedAgent, until: Array<"idle" | "working" | "blocked" | "done" | "unknown"> = ["idle", "done", "blocked"], timeout = 60_000) {
    const argv = ["herdr", "agent", "wait", this.target(agent), "--timeout", String(timeout)]
    for (const status of until) argv.push("--until", status)
    const result = await this.run(argv)
    if (result.code !== 0) throw new HerdrError(`agent did not reach ${until.join("|")}`)
  }

  async get(agent: OwnedAgent): Promise<AgentState> {
    const result = await this.run(["herdr", "agent", "get", this.target(agent)])
    if (result.code !== 0) throw new HerdrError("agent get failed")
    const body = asRecord(parseCliJson(result.stdout))
    const row = asRecord(body?.agent) ?? body
    if (!row) throw new HerdrError("invalid agent get response")
    const terminalId = requireString(row.terminal_id, "terminal_id")
    const paneId = requireString(row.pane_id, "pane_id")
    const statusRaw = typeof row.agent_status === "string" ? row.agent_status : typeof row.status === "string" ? row.status : ""
    if (paneId !== agent.paneId) throw new HerdrError("mismatched agent get response")
    const status = ["done", "idle", "working", "blocked", "cancelled", "unknown"].includes(statusRaw)
      ? statusRaw as AgentState["status"]
      : "unknown"
    return { terminalId, paneId, tabId: agent.tabId, jobId: agent.jobId, status }
  }

  async read(agent: OwnedAgent) {
    const result = await this.run(["herdr", "agent", "read", this.target(agent), "--source", "recent-unwrapped", "--lines", "40"])
    if (result.code !== 0) throw new HerdrError("agent read failed")
    return result.stdout
  }

  async send(agent: OwnedAgent, text: string) {
    // Prefer agent prompt; Cursor often needs an extra Enter to submit the composer input.
    const prompted = await this.run(["herdr", "agent", "prompt", this.target(agent), text])
    if (prompted.code === 0) {
      await this.run(["herdr", "pane", "send-keys", agent.paneId, "enter"]).catch(() => undefined)
      return
    }
    const result = await this.run(["herdr", "pane", "run", agent.paneId, text])
    if (result.code !== 0) throw new HerdrError("agent send failed")
  }
}
