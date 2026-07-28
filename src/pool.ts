import { asRecord, defaultRun, parseCliJson, requireString, type Run } from "./cli.js"
import { HerdrError } from "./errors.js"

export const HERDR_TAB_LABEL = "opencode-herdr"
export const MAX_JOB_PANES = 4
export const JOB_PANE_PREFIX = "oh-"

export type JobRecord = {
  jobId: string
  workspaceId: string
  tabId: string
  paneId: string
  terminalId: string
  status: "running" | "done" | "error" | "cancelled"
}

type TabRow = { tab_id: string; workspace_id: string; label?: string; pane_count?: number }
type PaneRow = { pane_id: string; tab_id: string; workspace_id: string; terminal_id: string; label?: string }

export type HerdrPoolOptions = {
  run?: Run
  maxPanes?: number
  tabLabel?: string
  /** How long to wait for a free slot when the tab is full. */
  acquireTimeoutMs?: number
}

/** Sanitize to Herdr agent name rules: lowercase letters/digits/-/_ , 1–32 chars. */
export function herdrAgentName(seed: string): string {
  const cleaned = seed.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
  const body = (cleaned || "job").slice(0, 24)
  return `oh-${body}`.slice(0, 32)
}

export class HerdrPool {
  private readonly run: Run
  private readonly maxPanes: number
  private readonly tabLabel: string
  private readonly acquireTimeoutMs: number
  private readonly jobs = new Map<string, JobRecord>()

  constructor(options: HerdrPoolOptions = {}) {
    this.run = options.run ?? defaultRun
    this.maxPanes = options.maxPanes ?? MAX_JOB_PANES
    this.tabLabel = options.tabLabel ?? HERDR_TAB_LABEL
    this.acquireTimeoutMs = options.acquireTimeoutMs ?? 120_000
  }

  list(): JobRecord[] {
    return [...this.jobs.values()]
  }

  get(jobId: string): JobRecord | undefined {
    return this.jobs.get(jobId)
  }

  async ensureTab(workspaceId: string, cwd: string): Promise<{ tabId: string; seedPaneId: string; seedTerminalId: string }> {
    const tabs = await this.listTabs(workspaceId)
    let tab = tabs.find((t) => t.label === this.tabLabel && t.workspace_id === workspaceId)
    if (!tab) {
      tab = await this.createTab(workspaceId, cwd)
    }
    const panes = (await this.listPanes(workspaceId)).filter((p) => p.tab_id === tab!.tab_id)
    const seed = panes[0]
    if (!seed) throw new HerdrError("herdr tab has no panes")
    return { tabId: tab.tab_id, seedPaneId: seed.pane_id, seedTerminalId: seed.terminal_id }
  }

  /**
   * Reserve a pane slot in the dedicated herdr tab (max concurrent job panes).
   * Splits a new pane when under cap; waits for a free slot when full.
   */
  async acquire(input: {
    jobId: string
    workspaceId: string
    cwd: string
    env?: Record<string, string>
  }): Promise<JobRecord> {
    if (this.jobs.has(input.jobId)) throw new HerdrError("job already acquired")
    const deadline = Date.now() + this.acquireTimeoutMs
    while (Date.now() < deadline) {
      const { tabId, seedPaneId } = await this.ensureTab(input.workspaceId, input.cwd)
      const jobPanes = await this.jobPanes(input.workspaceId, tabId)
      if (jobPanes.length >= this.maxPanes) {
        await Bun.sleep(400)
        continue
      }
      const created = await this.splitPane({
        seedPaneId,
        cwd: input.cwd,
        env: input.env,
      })
      const label = `${JOB_PANE_PREFIX}${input.jobId.replace(/-/g, "").slice(0, 10)}`
      await this.renamePane(created.paneId, label)
      const record: JobRecord = {
        jobId: input.jobId,
        workspaceId: input.workspaceId,
        tabId,
        paneId: created.paneId,
        terminalId: created.terminalId,
        status: "running",
      }
      this.jobs.set(input.jobId, record)
      return record
    }
    throw new HerdrError(`herdr tab full (max ${this.maxPanes} job panes)`)
  }

  async release(jobId: string, opts: { closePane?: boolean; status?: JobRecord["status"] } = {}): Promise<void> {
    const record = this.jobs.get(jobId)
    if (!record) return
    record.status = opts.status ?? "done"
    if (opts.closePane !== false) {
      await this.run(["herdr", "pane", "close", record.paneId]).catch(() => undefined)
    }
    this.jobs.delete(jobId)
  }

  /** Close all oh-* job panes in the dedicated herdr tab and clear the in-memory job registry. */
  async drainJobPanes(workspaceId: string): Promise<{ closed: string[] }> {
    const tabs = await this.listTabs(workspaceId)
    const tab = tabs.find((t) => t.label === this.tabLabel && t.workspace_id === workspaceId)
    if (!tab) {
      this.jobs.clear()
      return { closed: [] }
    }
    const panes = await this.listPanes(workspaceId)
    const jobPanes = panes.filter(
      (p) => p.tab_id === tab.tab_id && typeof p.label === "string" && p.label.startsWith(JOB_PANE_PREFIX),
    )
    const closed: string[] = []
    for (const pane of jobPanes) {
      const result = await this.run(["herdr", "pane", "close", pane.pane_id]).catch(() => ({ code: 1, stdout: "", stderr: "close failed" }))
      if (result.code === 0) closed.push(pane.pane_id)
    }
    this.jobs.clear()
    return { closed }
  }

  private async jobPanes(workspaceId: string, tabId: string): Promise<PaneRow[]> {
    const panes = await this.listPanes(workspaceId)
    return panes.filter((p) => p.tab_id === tabId && typeof p.label === "string" && p.label.startsWith(JOB_PANE_PREFIX))
  }

  private async listTabs(workspaceId: string): Promise<TabRow[]> {
    const result = await this.run(["herdr", "tab", "list", "--workspace", workspaceId])
    if (result.code !== 0) throw new HerdrError("tab list failed")
    const body = asRecord(parseCliJson(result.stdout))
    const tabs = body?.tabs
    if (!Array.isArray(tabs)) throw new HerdrError("invalid tab list")
    return tabs.flatMap((row) => {
      const r = asRecord(row)
      if (!r) return []
      try {
        return [{
          tab_id: requireString(r.tab_id, "tab_id"),
          workspace_id: requireString(r.workspace_id, "workspace_id"),
          label: typeof r.label === "string" ? r.label : undefined,
          pane_count: typeof r.pane_count === "number" ? r.pane_count : undefined,
        }]
      } catch {
        return []
      }
    })
  }

  private async createTab(workspaceId: string, cwd: string): Promise<TabRow> {
    const result = await this.run([
      "herdr", "tab", "create",
      "--workspace", workspaceId,
      "--cwd", cwd,
      "--label", this.tabLabel,
      "--no-focus",
    ])
    if (result.code !== 0) throw new HerdrError("tab create failed")
    const body = asRecord(parseCliJson(result.stdout))
    const tab = asRecord(body?.tab) ?? body
    if (!tab) throw new HerdrError("invalid tab create")
    return {
      tab_id: requireString(tab.tab_id, "tab_id"),
      workspace_id: requireString(tab.workspace_id ?? workspaceId, "workspace_id"),
      label: typeof tab.label === "string" ? tab.label : this.tabLabel,
    }
  }

  private async listPanes(workspaceId: string): Promise<PaneRow[]> {
    const result = await this.run(["herdr", "pane", "list", "--workspace", workspaceId])
    if (result.code !== 0) throw new HerdrError("pane list failed")
    const body = asRecord(parseCliJson(result.stdout))
    const panes = body?.panes
    if (!Array.isArray(panes)) throw new HerdrError("invalid pane list")
    return panes.flatMap((row) => {
      const r = asRecord(row)
      if (!r) return []
      try {
        return [{
          pane_id: requireString(r.pane_id, "pane_id"),
          tab_id: requireString(r.tab_id, "tab_id"),
          workspace_id: requireString(r.workspace_id, "workspace_id"),
          terminal_id: requireString(r.terminal_id, "terminal_id"),
          label: typeof r.label === "string" ? r.label : undefined,
        }]
      } catch {
        return []
      }
    })
  }

  private async splitPane(input: { seedPaneId: string; cwd: string; env?: Record<string, string> }): Promise<{ paneId: string; terminalId: string }> {
    const envFlags = Object.entries(input.env ?? {}).flatMap(([key, value]) => {
      if (!/^[A-Z0-9_]+$/.test(key) || /[\n\r\0]/.test(value)) throw new HerdrError("unsafe agent env")
      return ["--env", `${key}=${value}`]
    })
    const result = await this.run([
      "herdr", "pane", "split",
      "--pane", input.seedPaneId,
      "--direction", "right",
      "--cwd", input.cwd,
      ...envFlags,
      "--no-focus",
    ])
    if (result.code !== 0) throw new HerdrError("pane split failed")
    const body = asRecord(parseCliJson(result.stdout))
    const pane = asRecord(body?.pane) ?? asRecord(body?.created) ?? body
    if (!pane) throw new HerdrError("invalid pane split")
    return {
      paneId: requireString(pane.pane_id, "pane_id"),
      terminalId: requireString(pane.terminal_id, "terminal_id"),
    }
  }

  private async renamePane(paneId: string, label: string): Promise<void> {
    const result = await this.run(["herdr", "pane", "rename", paneId, label])
    if (result.code !== 0) throw new HerdrError("pane rename failed")
  }
}
