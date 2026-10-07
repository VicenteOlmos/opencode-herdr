import { expect, test } from "bun:test"
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import { createHerdr } from "../src/provider.js"
import { executeWithHerdrLocation, HERDR_LOCATION_HEADER } from "../src/request-location.js"

const target = {
  id: "herdr/cursor/agent",
  name: "Cursor agent",
  adapter: "cursor",
  nativeModel: "agent",
  provenance: "verified" as const,
  limits: { context: 1, output: 1 },
  toolCall: false,
}

const success = (id: string) => ({
  schemaVersion: 1 as const,
  jobId: id,
  targetId: target.id,
  status: "done" as const,
  text: id,
  delegatedTools: false,
})

test("beta model calls bind concurrent generate and stream calls to their own session directory", async () => {
  const calls: Array<{ directory: string; options: LanguageModelV3CallOptions }> = []
  const model = createHerdr({
    targets: [target],
    execute: (_target, options) => executeWithHerdrLocation(options, async (directory, cleanOptions) => {
      calls.push({ directory, options: cleanOptions })
      return success(directory)
    }),
  }).languageModel("cursor/agent")
  const generateOptions = { prompt: [], headers: { [HERDR_LOCATION_HEADER]: "/workspaces/one", "X-OpenCode-Herdr-Directory": "/untrusted", "x-client-trace": "trace-one" } } as LanguageModelV3CallOptions
  const streamOptions = { prompt: [], headers: { [HERDR_LOCATION_HEADER]: "/workspaces/two" } } as LanguageModelV3CallOptions

  const [generated, streamed] = await Promise.all([
    model.doGenerate(generateOptions),
    model.doStream(streamOptions),
  ])
  const streamParts: any[] = []
  for await (const part of streamed.stream) streamParts.push(part)

  expect(calls.map((call) => call.directory).sort()).toEqual(["/workspaces/one", "/workspaces/two"])
  expect(calls.find((call) => call.directory === "/workspaces/one")?.options.headers).toEqual({ "x-client-trace": "trace-one" })
  expect(calls.find((call) => call.directory === "/workspaces/two")?.options.headers).toBeUndefined()
  expect(generateOptions.headers?.[HERDR_LOCATION_HEADER]).toBe("/workspaces/one")
  expect(generateOptions.headers?.["X-OpenCode-Herdr-Directory"]).toBe("/untrusted")
  expect(generateOptions.headers?.["x-client-trace"]).toBe("trace-one")
  expect(streamOptions.headers?.[HERDR_LOCATION_HEADER]).toBe("/workspaces/two")
  expect(generated.content).toHaveLength(1)
  expect(streamParts.map((part) => part.type)).toContain("text-delta")
})

test("native Herdr model calls fail closed when request location is absent or malformed", async () => {
  const model = createHerdr({
    targets: [target],
    execute: (_target, options) => executeWithHerdrLocation(options, async () => success("unused")),
  }).languageModel("cursor/agent")

  await expect(model.doGenerate({ prompt: [] } as any)).rejects.toThrow("request location")
  await expect(model.doGenerate({ prompt: [], headers: { [HERDR_LOCATION_HEADER]: "relative/path" } } as any))
    .rejects.toThrow("absolute directory")
})
