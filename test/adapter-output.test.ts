import { expect, test } from "bun:test"
import { AdapterOutput, DiagnosticTail, MAX_EVENT_BYTES, MAX_RESPONSE_BYTES } from "../src/adapter-output"
import { finalAssistantText } from "../src/runner"

const cases = [
  ["cursor", [{ type: "assistant", message: { content: [{ text: "draft" }] } }, { type: "result", result: "cursor final" }], "cursor final"],
  ["claude", [{ type: "assistant", message: { content: [{ text: "draft" }, { text: "last" }] } }, { type: "result", result: "claude final" }], "claude final"],
  ["codex", [{ type: "item.completed", item: { type: "agent_message", text: "co" } }, { type: "item.completed", item: { type: "agent_message", text: "dex" } }], "codex"],
  ["opencode", [{ type: "text", part: { text: "open" } }, { type: "text", text: "code" }], "opencode"],
] as const

for (const [adapter, events, expected] of cases) {
  test(`${adapter}: fragmented output preserves existing final-text behavior`, () => {
    const input = events.map((event) => JSON.stringify(event)).join("\n")
    expect(finalAssistantText(adapter, input)).toBe(expected)
    const parser = new AdapterOutput(adapter)
    for (let offset = 0; offset < input.length; offset += 7) parser.push(input.slice(offset, offset + 7))
    expect(parser.finish()).toBe(expected)
  })
}

test("large progress history is discarded without changing the final response", () => {
  const parser = new AdapterOutput("cursor")
  const event = `${JSON.stringify({ type: "tool", output: "x".repeat(4096) })}\n`
  for (let i = 0; i < 10_000; i++) parser.push(event)
  parser.push('{"type":"result","result":"done 🌎"}\n')
  expect(parser.finish()).toBe("done 🌎")
})

test("JSONL validation preserves blank-line and malformed-output behavior", () => {
  const valid = '{"type":"result","result":"ok"}'
  expect(finalAssistantText("cursor", `\n  ${valid}\n\n `)).toBe("ok")
  for (const input of ["", "{bad", "null", `${valid}\n\n${valid}`]) {
    expect(() => finalAssistantText("cursor", input)).toThrow("invalid adapter output")
  }
})

test("oversized events are rejected explicitly even across chunks", () => {
  const parser = new AdapterOutput("cursor")
  const chunk = "x".repeat(64 * 1024)
  for (let i = 0; i <= MAX_EVENT_BYTES / chunk.length; i++) parser.push(chunk)
  expect(() => parser.finish()).toThrow("adapter event exceeds 8 MiB limit")
})

test("concatenated final responses have an explicit bounded size", () => {
  const parser = new AdapterOutput("opencode")
  const event = `${JSON.stringify({ type: "text", text: "x".repeat(64 * 1024) })}\n`
  for (let i = 0; i <= MAX_RESPONSE_BYTES / (64 * 1024); i++) parser.push(event)
  expect(() => parser.finish()).toThrow("adapter response exceeds 8 MiB limit")
})

test("diagnostics keep a bounded tail instead of the entire stderr transcript", () => {
  const tail = new DiagnosticTail()
  tail.push("old error\n")
  tail.push("x".repeat(32_768))
  tail.push("\nrecent error")
  expect(tail.text.length).toBe(16_384)
  expect(tail.text.endsWith("recent error")).toBeTrue()
  expect(tail.text).not.toContain("old error")
})
