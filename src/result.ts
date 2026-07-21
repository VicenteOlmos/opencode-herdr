import type { LanguageModelV3FinishReason, LanguageModelV3Usage } from "@ai-sdk/provider"
import type { JobResultV1 } from "./job.js"
import { HerdrError } from "./errors.js"
import { sanitize } from "./sanitize.js"

export const usage = (result: JobResultV1): LanguageModelV3Usage => ({
  inputTokens: { total: result.usage?.input, noCache: result.usage?.input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: result.usage?.output, text: result.usage?.output, reasoning: undefined },
})
export function completed(result: JobResultV1) {
  if (result.status !== "done") throw new HerdrError(sanitize(result.diagnostic || `agent ${result.status}`))
  return result.text ?? ""
}
export function finish(result: JobResultV1): LanguageModelV3FinishReason {
  const raw = result.nativeFinish ?? "stop"
  const unified = raw === "length" ? "length" : raw === "content-filter" ? "content-filter" : raw === "tool-calls" ? "tool-calls" : raw === "error" ? "error" : raw === "stop" ? "stop" : "other"
  return { unified, raw }
}
