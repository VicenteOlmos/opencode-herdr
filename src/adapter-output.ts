import { HerdrError } from "./errors.js"

export const MAX_EVENT_BYTES = 8 * 1024 * 1024
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024

type Event = Record<string, unknown>
const object = (value: unknown): Event | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Event : undefined
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : undefined

/** Split streamed text without retaining an unlimited unterminated line. */
export class OutputLines {
  private line = ""
  private bytes = 0
  private overflow = false
  constructor(private readonly consume: (line: string) => void, private readonly limit: number, private readonly onOverflow: () => void = () => {}) {}

  push(chunk: string) {
    let start = 0
    while (start < chunk.length) {
      const end = chunk.indexOf("\n", start)
      const part = chunk.slice(start, end < 0 ? undefined : end)
      if (!this.overflow) {
        this.bytes += Buffer.byteLength(part)
        if (this.bytes > this.limit) {
          this.overflow = true
          this.line = ""
          this.onOverflow()
        } else this.line += part
      }
      if (end < 0) break
      if (!this.overflow) this.consume(this.line)
      this.line = ""
      this.bytes = 0
      this.overflow = false
      start = end + 1
    }
  }

  finish() {
    if (!this.overflow && this.line.length) this.consume(this.line)
    this.line = ""
  }
}

/** Keep response text only; tool events and old Claude/Cursor responses are discarded. */
export class AdapterOutput {
  private readonly lines: OutputLines
  private response = ""
  private responseBytes = 0
  private seen = false
  private blank = false
  private error?: string

  constructor(private readonly adapter: string, onEvent?: (event: Event) => void, onInvalidLine?: (line: string) => void) {
    this.lines = new OutputLines((line) => {
      if (!line.trim()) {
        if (this.seen) this.blank = true
        return
      }
      try {
        const event = object(JSON.parse(this.seen ? line : line.trimStart()))
        if (!event) { this.error ??= "invalid adapter output"; return }
        if (this.blank) this.error ??= "invalid adapter output"
        this.seen = true
        onEvent?.(event)
        if (this.error) return
        const content = object(event.message)?.content
        const item = object(event.item)
        const messages = this.adapter === "cursor" || this.adapter === "claude"
          ? Array.isArray(content) ? content.map(object).map((part) => text(part?.text)) : [text(event.result)]
          : this.adapter === "opencode"
            ? event.type === "text" ? [text(object(event.part)?.text) ?? text(event.text)] : []
            : event.type === "item.completed" && item?.type === "agent_message" ? [text(item.text)] : []
        for (const message of messages) {
          if (!message) continue
          const replace = this.adapter === "cursor" || this.adapter === "claude"
          this.responseBytes = (replace ? 0 : this.responseBytes) + Buffer.byteLength(message)
          if (this.responseBytes > MAX_RESPONSE_BYTES) {
            this.error = "adapter response exceeds 8 MiB limit"
            this.response = ""
            break
          }
          this.response = replace ? message : this.response + message
        }
      } catch {
        onInvalidLine?.(line)
        this.error ??= "invalid adapter output"
      }
    }, MAX_EVENT_BYTES, () => { this.error ??= "adapter event exceeds 8 MiB limit" })
  }

  push(chunk: string) { this.lines.push(chunk) }
  flush() { this.lines.finish() }

  finish(): string {
    this.flush()
    if (this.error || !this.response) throw new HerdrError(this.error ?? "invalid adapter output")
    return this.response
  }
}

export class DiagnosticTail {
  text = ""
  push(chunk: string) { this.text = (this.text + chunk).slice(-16_384) }
}

export function finalAssistantText(adapter: string, output: string): string {
  const parser = new AdapterOutput(adapter)
  parser.push(output.trim())
  return parser.finish()
}
