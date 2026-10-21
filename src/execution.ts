import { constants } from "node:fs"
import { open } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { adapterFor, type Target } from "./adapters/types.js"
import { AdapterOutput, DiagnosticTail } from "./adapter-output.js"
import { adapterArgv } from "./effort.js"
import { AbortError, HerdrError } from "./errors.js"
import { readResult, writeResult, type Job, type JobResultV1 } from "./job.js"

export type RunnerBackend = "native" | "bun"

export function executionFor(job: Job, target: Target, task: string, effort?: string, backend?: string) {
  const shell = process.platform !== "win32" ? Bun.which("sh") : undefined
  const selected = backend ?? process.env.OPENCODE_HERDR_RUNNER ?? (shell ? "native" : "bun")
  if (selected !== "native" && selected !== "bun") throw new HerdrError("unsupported runner")
  if (selected === "native") {
    if (!shell) throw new HerdrError("native runner requires a POSIX shell")
    if ([target.id, target.adapter, target.nativeModel].some((arg) => /[\n\r\0]/.test(arg))) throw new HerdrError("unsafe agent arg")
    const command = adapterArgv(target.adapter, target.nativeModel, task, effort)
    if (command.some((arg) => arg.includes("\0"))) throw new HerdrError("unsafe agent arg")
    // Keep multiline prompts out of terminal input. Every argv value is a shell literal.
    const script = `exec ${command.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(" ")}\n`
    return { native: true, script, argv: [shell, fileURLToPath(new URL("../bin/opencode-herdr-engine", import.meta.url)), job.dir, "--", shell, join(job.dir, "command.sh")] }
  }
  return { native: false, argv: [Bun.which("bun") ?? "bun", fileURLToPath(new URL("./runner.ts", import.meta.url)), job.dir, target.id, target.adapter, target.nativeModel] }
}

async function privateCapture(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    if (!info.isFile() || (info.mode & 0o077)) throw new HerdrError("unsafe native capture file")
    return { file, size: info.size }
  } catch (error) { await file.close(); throw error }
}

/** Parse captures in the existing OpenCode host, without starting another JS runtime. */
export async function nativeResult(job: Job, target: Target, abort?: AbortSignal, deadline = Infinity): Promise<JobResultV1> {
  const check = () => {
    if (abort?.aborted) throw new AbortError()
    if (Date.now() >= deadline) throw new HerdrError("agent result unavailable: timeout", "RUNNER_TIMEOUT")
  }
  check()
  const marker = await privateCapture(join(job.dir, "exit.status"))
  let code: number
  try {
    if (marker.size > 4) throw new HerdrError("invalid native exit status")
    const value = await marker.file.readFile("utf8")
    if (!/^\d{1,3}\n$/.test(value) || Number(value) > 255) throw new HerdrError("invalid native exit status")
    code = Number(value)
  } finally { await marker.file.close() }
  const adapter = adapterFor(target.adapter)
  if (!adapter) throw new HerdrError("unsupported adapter")
  const base = { schemaVersion: 1 as const, jobId: job.id, targetId: target.id, delegatedTools: adapter.toolCall }
  let result: JobResultV1
  if (code !== 0) {
    const capture = await privateCapture(join(job.dir, "stderr.log"))
    const tail = new DiagnosticTail()
    try {
      for await (const chunk of capture.file.createReadStream({ encoding: "utf8", start: Math.max(0, capture.size - 65_536), autoClose: false })) {
        check()
        tail.push(String(chunk))
      }
    } finally { await capture.file.close() }
    result = { ...base, status: "error", diagnostic: tail.text || `exit ${code}` }
  } else {
    const capture = await privateCapture(join(job.dir, "stdout.jsonl"))
    const output = new AdapterOutput(target.adapter)
    try {
      for await (const chunk of capture.file.createReadStream({ encoding: "utf8", autoClose: false })) {
        check()
        output.push(String(chunk))
      }
      result = { ...base, status: "done", text: output.finish() }
    } catch (error) {
      if (error instanceof AbortError || error instanceof HerdrError && error.code === "RUNNER_TIMEOUT") throw error
      result = { ...base, status: "error", diagnostic: error instanceof Error ? error.message : "invalid adapter output" }
    } finally { await capture.file.close() }
  }
  check()
  await writeResult(job, result)
  return readResult(job, target.id)
}
