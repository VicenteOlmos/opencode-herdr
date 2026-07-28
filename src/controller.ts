import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import type { Target } from "./adapters/types.js"
import { effortFromCallOptions } from "./effort.js"
import { HerdrAgent, type Run } from "./herdr.js"
import { createJob, readResult, removeJob, type Job, type JobResultV1 } from "./job.js"
import { taskFromPrompt } from "./messages.js"
import { HerdrPool } from "./pool.js"
import { AbortError, HerdrError } from "./errors.js"

export type ControllerOptions = {
  root?: string
  cwd?: string
  workspace?: string
  tab?: string
  pane?: string
  run?: Run
  pool?: HerdrPool
  result?: (job: Job, target: Target) => Promise<JobResultV1>
  /** Max time to wait for the runner result file. */
  resultTimeoutMs?: number
  /** Keep oh-* panes after the job finishes (plugin keepPanes / debug). */
  keepPanes?: boolean
  /** Keep /tmp/.opencode-herdr-* dirs after the job finishes (plugin keepJobs / debug). */
  keepJobs?: boolean
}

export class HerdrController {
  private readonly agent: HerdrAgent
  private readonly pool: HerdrPool
  constructor(private readonly options: ControllerOptions = {}) {
    this.agent = new HerdrAgent(options.run)
    this.pool = options.pool ?? new HerdrPool({ run: options.run })
  }

  async execute(target: Target, options: LanguageModelV3CallOptions): Promise<JobResultV1> {
    if (!this.options.cwd || !this.options.workspace) throw new HerdrError("Herdr runtime context is unavailable")
    if (options.abortSignal?.aborted) throw new AbortError()
    const effort = effortFromCallOptions(options)
    const job = await createJob(taskFromPrompt(options.prompt), this.options.root ?? "/tmp", { effort })
    const closePane = !this.options.keepPanes
    let owned: { terminalId: string; paneId: string; jobId?: string } | undefined
    const abort = async () => {
      if (owned) {
        await this.agent.cancel(owned, this.pool, { closePane })
        owned = undefined
      }
      if (!this.options.keepJobs) await removeJob(job)
    }
    const onAbort = () => { void abort() }
    options.abortSignal?.addEventListener("abort", onAbort, { once: true })
    try {
      const runner = [
        Bun.which("bun") ?? "bun",
        new URL("./runner.ts", import.meta.url).pathname,
        job.dir,
        target.id,
        target.adapter,
        target.nativeModel,
      ]
      owned = await this.agent.startJob({
        jobId: job.id,
        cwd: this.options.cwd,
        workspace: this.options.workspace,
        argv: runner,
        env: { OPENCODE_HERDR_JOB: job.dir },
        pool: this.pool,
      })
      const result = await this.waitForResult(job, target, options.abortSignal)
      return result
    } catch (error) {
      if (options.abortSignal?.aborted || error instanceof AbortError) {
        await abort()
        throw new AbortError()
      }
      throw error
    } finally {
      options.abortSignal?.removeEventListener("abort", onAbort)
      if (owned?.jobId) {
        await this.pool.release(owned.jobId, { status: "done", closePane }).catch(() => undefined)
      } else if (owned && closePane) {
        await this.agent.close(owned).catch(() => undefined)
      }
      if (!this.options.keepJobs) await removeJob(job)
      else console.error(`[herdr] keepJobs: left ${job.dir} (pane ${owned?.paneId ?? "n/a"})`)
    }
  }

  private async waitForResult(job: Job, target: Target, abortSignal?: AbortSignal): Promise<JobResultV1> {
    const timeoutMs = this.options.resultTimeoutMs ?? 600_000
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (abortSignal?.aborted) throw new AbortError()
      try {
        const result = this.options.result
          ? await this.options.result(job, target)
          : await readResult(job, target.id)
        if (result.targetId !== target.id) throw new HerdrError("result target mismatch")
        return result
      } catch {
        await Bun.sleep(200)
      }
    }
    throw new HerdrError("agent result unavailable: timeout")
  }
}
