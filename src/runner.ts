import { readFile } from "node:fs/promises"
import { adapterFor } from "./adapters/types.js"
import { adapterArgv, normalizeEffort } from "./effort.js"
import { type Job, writeResult } from "./job.js"
import { HerdrError } from "./errors.js"

type Event = Record<string, unknown>
const object = (value: unknown): Event | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Event : undefined
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : undefined

const status = (line: string) => {
  console.error(`[herdr] ${line}`)
}

const clip = (value: string, max = 120) => {
  const one = value.replace(/\s+/g, " ").trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

/** One-line pane progress from an adapter stream-json event. */
export function describeAdapterEvent(adapter: string, event: Event): string | undefined {
  const type = typeof event.type === "string" ? event.type : undefined
  if (adapter === "cursor" || adapter === "claude") {
    if (type === "result" || type === "turn_ended") {
      const st = typeof event.status === "string" ? event.status : "done"
      return `finished (${st})`
    }
    const content = object(event.message)?.content
    if (!Array.isArray(content)) {
      const result = text(event.result)
      return result ? `assistant: ${clip(result)}` : undefined
    }
    for (const part of content.map(object)) {
      if (!part) continue
      if (part.type === "tool_use") {
        const name = typeof part.name === "string" ? part.name : "tool"
        const input = object(part.input)
        const hint =
          (typeof input?.path === "string" && input.path)
          || (typeof input?.command === "string" && clip(input.command, 80))
          || (typeof input?.query === "string" && clip(input.query, 80))
          || (typeof input?.toolName === "string" && input.toolName)
          || ""
        return hint ? `tool ${name}: ${hint}` : `tool ${name}`
      }
      if (part.type === "text") {
        const body = text(part.text)
        if (body) return `assistant: ${clip(body)}`
      }
    }
    return type ? `event ${type}` : undefined
  }
  if (adapter === "opencode") {
    if (type === "text") {
      const body = text(object(event.part)?.text) ?? text(event.text)
      return body ? `assistant: ${clip(body)}` : undefined
    }
    if (type === "tool_use" || type === "tool_call") {
      const name = typeof event.name === "string" ? event.name : "tool"
      return `tool ${name}`
    }
    if (type === "step_finish" || type === "finish") return "finished"
    return type ? `event ${type}` : undefined
  }
  // codex
  if (type === "turn.started") return "turn started"
  if (type === "turn.completed") return "turn completed"
  const item = object(event.item)
  if (type === "item.completed" && item) {
    if (item.type === "agent_message") {
      const body = text(item.text)
      return body ? `assistant: ${clip(body)}` : "assistant message"
    }
    if (typeof item.type === "string") return `item ${item.type}`
  }
  return type ? `event ${type}` : undefined
}

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

async function readStream(
  stream: ReadableStream<Uint8Array> | null,
  onChunkLine?: (line: string) => void,
): Promise<string> {
  if (!stream) return ""
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  let out = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    out += chunk
    if (!onChunkLine) continue
    buf += chunk
    for (;;) {
      const nl = buf.indexOf("\n")
      if (nl < 0) break
      onChunkLine(buf.slice(0, nl))
      buf = buf.slice(nl + 1)
    }
  }
  if (onChunkLine && buf.length) onChunkLine(buf)
  return out
}

export async function runJob(job: Job, targetId: string, adapterId: string, nativeModel: string) {
  const adapter = adapterFor(adapterId); if (!adapter) throw new HerdrError("unsupported adapter")
  const request = JSON.parse(await readFile(job.request, "utf8")) as { task: string; effort?: string }
  const argv = adapterArgv(adapterId, nativeModel, request.task, normalizeEffort(request.effort))
  const started = Date.now()
  status(`start ${adapterId}/${nativeModel} job=${job.id.slice(0, 8)} task=${request.task.length}B`)
  status(`argv ${argv.slice(0, 6).join(" ")}${argv.length > 6 ? " …" : ""}`)

  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: process.env })
  const heartbeat = setInterval(() => {
    const sec = Math.round((Date.now() - started) / 1000)
    status(`waiting… ${sec}s (agent still running; OpenCode parent is blocked on result.json)`)
  }, 15_000)

  let stdout = ""
  let stderr = ""
  try {
    const outP = readStream(child.stdout, (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        const event = object(JSON.parse(trimmed))
        if (!event) return
        const note = describeAdapterEvent(adapterId, event)
        if (note) status(note)
      } catch {
        // non-JSON progress lines (rare) — show clipped
        status(`out: ${clip(trimmed, 100)}`)
      }
    })
    const errP = readStream(child.stderr, (line) => {
      const trimmed = line.trim()
      if (trimmed) status(`err: ${clip(trimmed, 160)}`)
    })
    ;[stdout, stderr] = await Promise.all([outP, errP])
  } finally {
    clearInterval(heartbeat)
  }

  const code = await child.exited
  const elapsed = Math.round((Date.now() - started) / 1000)
  if (code !== 0) {
    status(`exit ${code} after ${elapsed}s — writing error result`)
    return writeResult(job, { schemaVersion: 1, jobId: job.id, targetId, status: "error", diagnostic: stderr || `exit ${code}`, delegatedTools: adapter.toolCall })
  }
  try {
    const textOut = finalAssistantText(adapterId, stdout)
    status(`done ${elapsed}s — result ${textOut.length} chars → result.json`)
    await writeResult(job, { schemaVersion: 1, jobId: job.id, targetId, status: "done", text: textOut, delegatedTools: adapter.toolCall })
  } catch {
    status(`done ${elapsed}s — invalid adapter output`)
    await writeResult(job, { schemaVersion: 1, jobId: job.id, targetId, status: "error", diagnostic: "invalid adapter output", delegatedTools: adapter.toolCall })
  }
}

if (import.meta.main) {
  const [dir, targetId, adapterId, nativeModel] = Bun.argv.slice(2)
  if (!dir || !targetId || !adapterId || !nativeModel) process.exitCode = 1
  else {
    const job: Job = { id: dir.split(".opencode-herdr-").at(-1) ?? "", dir, request: `${dir}/request.json`, result: `${dir}/result.json` }
    try { await runJob(job, targetId, adapterId, nativeModel) } catch (error) { console.error(error instanceof Error ? error.message : "runner failed"); process.exitCode = 1 }
  }
}
