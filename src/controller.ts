import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import type { Target } from "./adapters/types.js"
import { HerdrAgent, type Run } from "./herdr.js"
import { createJob, readResult, removeJob, type Job, type JobResultV1 } from "./job.js"
import { taskFromPrompt } from "./messages.js"
import { AbortError, HerdrError } from "./errors.js"

export type ControllerOptions = { root?: string; cwd?: string; workspace?: string; tab?: string; pane?: string; run?: Run; result?: (job: Job, target: Target) => Promise<JobResultV1> }
export class HerdrController {
  private readonly agent: HerdrAgent
  constructor(private readonly options: ControllerOptions = {}) { this.agent = new HerdrAgent(options.run) }
  async execute(target: Target, options: LanguageModelV3CallOptions): Promise<JobResultV1> {
    if (!this.options.cwd || !this.options.workspace || !this.options.tab) throw new HerdrError("Herdr runtime context is unavailable")
    if (options.abortSignal?.aborted) throw new AbortError()
    const job = await createJob(taskFromPrompt(options.prompt), this.options.root ?? "/tmp")
    let owned: { terminalId: string; paneId: string } | undefined
    const abort = async () => { if (owned) { await this.agent.cancel(owned); owned = undefined }; await removeJob(job) }
    const onAbort = () => { void abort() }
    options.abortSignal?.addEventListener("abort", onAbort, { once: true })
    try {
      owned = await this.agent.start({ name: `opencode-herdr-${job.id}`, cwd: this.options.cwd, workspace: this.options.workspace, tab: this.options.tab, job: job.dir, argv: [Bun.which("bun") ?? "bun", new URL("./runner.ts", import.meta.url).pathname, job.dir, target.id, target.adapter, target.nativeModel] })
      await this.agent.wait(owned, "idle")
      if (options.abortSignal?.aborted) throw new AbortError()
      await this.agent.send(owned, "OPENCODE_HERDR_START")
      await this.agent.wait(owned, "working")
      await this.agent.wait(owned, "idle")
       const state = await this.agent.get(owned)
       if (state.status !== "done") throw new HerdrError(`agent result unavailable: ${state.status}`)
      await this.agent.read(owned)
      const result = this.options.result ? await this.options.result(job, target) : await readResult(job, target.id)
      if (result.targetId !== target.id) throw new HerdrError("result target mismatch")
      return result
    } catch (error) {
      if (options.abortSignal?.aborted || error instanceof AbortError) { await abort(); throw new AbortError() }
      throw error
    } finally { options.abortSignal?.removeEventListener("abort", onAbort); if (owned) await this.agent.close(owned); await removeJob(job) }
  }
}
