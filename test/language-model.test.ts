import { expect, test } from "bun:test"
import { createLanguageModel } from "../src/language-model"

const target = { id: "cursor-agent", name: "Cursor agent", adapter: "cursor", nativeModel: "agent", provenance: "verified" as const, limits: { context: 1, output: 1 }, toolCall: true as const, toolMode: "delegated-agent" as const }

test("R3 filters native tools and emits text only", async () => {
  const model = createLanguageModel(target, async () => ({ schemaVersion: 1, jobId: "j", targetId: target.id, status: "done", text: "ok", delegatedTools: true }))
  const result = await model.doGenerate({ prompt: [], tools: [{ type: "function", name: "bad", inputSchema: {} }] } as any)
  expect(result.content).toEqual([{ type: "text", text: "ok" }])
  expect(result.warnings).toHaveLength(1)
})

test("7.1 synthetic stream emits ordered AI SDK V3 response metadata without fabricated tool events", async () => {
  const model = createLanguageModel(target, async () => ({ schemaVersion: 1, jobId: "j", targetId: target.id, status: "done", text: "ok", delegatedTools: false }))
  const parts: any[] = []
  for await (const part of (await model.doStream({ prompt: [] } as any)).stream) parts.push(part)
  expect(parts.map((part) => part.type)).toEqual(["stream-start", "response-metadata", "text-start", "text-delta", "text-end", "finish"])
  expect(parts[1]).toMatchObject({ type: "response-metadata", modelId: target.id })
})
