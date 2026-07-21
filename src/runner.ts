import { readFile } from "node:fs/promises"
import { adapterFor } from "./adapters/types.js"
import { createJob, type Job, writeResult } from "./job.js"
import { HerdrError } from "./errors.js"

type Event = Record<string, unknown>
const object = (value: unknown): Event | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Event : undefined
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : undefined

export function finalAssistantText(adapter: string, output: string) {
  const events = output.trim().split("\n").map((line) => { try { return object(JSON.parse(line)) } catch { return undefined } })
  if (!events.length || events.some((event) => !event)) throw new HerdrError("invalid adapter output")
  const messages = events.flatMap((event) => {
    if (adapter === "cursor" || adapter === "claude") {
      const content = object(event)?.message && object(object(event)?.message)?.content
      return Array.isArray(content) ? content.map(object).map((part) => text(part?.text)).filter((part): part is string => !!part) : [text(event?.result)].filter((part): part is string => !!part)
    }
    if (adapter === "opencode") return object(event)?.type === "text" ? [text(object(object(event)?.part)?.text) ?? text(event?.text)].filter((part): part is string => !!part) : []
    const item = object(event)?.item
    return object(event)?.type === "item.completed" && object(item)?.type === "agent_message" ? [text(object(item)?.text)].filter((part): part is string => !!part) : []
  })
  const result = adapter === "cursor" || adapter === "claude" ? messages.at(-1) : messages.join("")
  if (!result) throw new HerdrError("invalid adapter output")
  return result
}

export async function runJob(job: Job, targetId: string, adapterId: string, nativeModel: string) {
  const adapter = adapterFor(adapterId); if (!adapter) throw new HerdrError("unsupported adapter")
  const request = JSON.parse(await readFile(job.request, "utf8")) as { task: string }
  const child = Bun.spawn([...adapter.command, "--model", nativeModel, request.task], { stdout: "pipe", stderr: "pipe", env: process.env })
  const stdout = await new Response(child.stdout).text(), stderr = await new Response(child.stderr).text(), code = await child.exited
  if (code !== 0) return writeResult(job, { schemaVersion: 1, jobId: job.id, targetId, status: "error", diagnostic: stderr, delegatedTools: adapter.toolCall })
  try { await writeResult(job, { schemaVersion: 1, jobId: job.id, targetId, status: "done", text: finalAssistantText(adapterId, stdout), delegatedTools: adapter.toolCall }) }
  catch { await writeResult(job, { schemaVersion: 1, jobId: job.id, targetId, status: "error", diagnostic: "invalid adapter output", delegatedTools: adapter.toolCall }) }
}

if (import.meta.main) {
  const [dir, targetId, adapterId, nativeModel] = Bun.argv.slice(2)
  if (!dir || !targetId || !adapterId || !nativeModel) process.exitCode = 1
  else {
    const job: Job = { id: dir.split(".opencode-herdr-").at(-1) ?? "", dir, request: `${dir}/request.json`, result: `${dir}/result.json` }
    try { await runJob(job, targetId, adapterId, nativeModel) } catch (error) { console.error(error instanceof Error ? error.message : "runner failed"); process.exitCode = 1 }
  }
}
