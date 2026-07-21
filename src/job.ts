import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { HerdrError } from "./errors.js"
import { sanitize } from "./sanitize.js"

export type Job = { id: string; dir: string; request: string; result: string }
export type JobResultV1 = { schemaVersion: 1; jobId: string; targetId: string; status: "done" | "error" | "cancelled"; text?: string; usage?: { input?: number; output?: number }; nativeFinish?: string; delegatedTools: boolean; diagnostic?: string }

export async function createJob(task: string, root: string): Promise<Job> {
  const id = crypto.randomUUID()
  const base = resolve(root, `.opencode-herdr-${id}`)
  if (!base.startsWith(`${resolve(root)}${process.platform === "win32" ? "\\" : "/"}`)) throw new HerdrError("unsafe job path")
  await mkdir(base, { recursive: false, mode: 0o700 })
  const request = join(base, "request.json"), result = join(base, "result.json")
  await writeFile(request, JSON.stringify({ schemaVersion: 1, id, task }), { mode: 0o600 })
  return { id, dir: base, request, result }
}
function validate(value: unknown, job?: Job): JobResultV1 {
  if (!value || typeof value !== "object") throw new HerdrError("invalid result")
  const result = value as JobResultV1
  if (result.schemaVersion !== 1 || !result.jobId || !result.targetId || !["done", "error", "cancelled"].includes(result.status) || typeof result.delegatedTools !== "boolean") throw new HerdrError("invalid result")
  if (job && result.jobId !== job.id) throw new HerdrError("result job mismatch")
  return { ...result, text: result.text && sanitize(result.text), diagnostic: result.diagnostic && sanitize(result.diagnostic) }
}
export async function writeResult(job: Job, result: JobResultV1) { const tmp = `${job.result}.tmp`; await writeFile(tmp, JSON.stringify(validate(result, job)), { mode: 0o600 }); await rename(tmp, job.result) }
export async function readResult(job: Job, targetId?: string) { const info = await lstat(job.result); if (info.isSymbolicLink() || !info.isFile() || (info.mode & 0o077)) throw new HerdrError("unsafe result file"); const result = validate(JSON.parse(await readFile(job.result, "utf8")), job); if (targetId && result.targetId !== targetId) throw new HerdrError("result target mismatch"); return result }
export async function removeJob(job: Job) { await rm(job.dir, { recursive: true, force: true }) }
