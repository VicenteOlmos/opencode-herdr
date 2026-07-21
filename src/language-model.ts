import type { LanguageModelV3, LanguageModelV3CallOptions, LanguageModelV3GenerateResult, LanguageModelV3StreamResult } from "@ai-sdk/provider"
import type { Target } from "./adapters/types.js"
import type { JobResultV1 } from "./job.js"
import { completed, finish, usage } from "./result.js"

const warnings = (options: LanguageModelV3CallOptions): LanguageModelV3GenerateResult["warnings"] => options.tools?.length ? [{ type: "other", message: "Herdr delegated tools are not OpenCode-native tool events" }] : []
export function createLanguageModel(target: Target, execute: (options: LanguageModelV3CallOptions) => Promise<JobResultV1>): LanguageModelV3 {
  const generate = async (options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> => {
    if (options.abortSignal?.aborted) throw new DOMException("Aborted", "AbortError")
    const result = await execute(options), text = completed(result)
    return { content: [{ type: "text", text }], finishReason: finish(result), usage: usage(result), warnings: warnings(options), providerMetadata: { herdr: { targetId: target.id, delegatedTools: result.delegatedTools } } }
  }
  return {
    specificationVersion: "v3", provider: "herdr", modelId: target.id, supportedUrls: {},
    doGenerate: generate,
    async doStream(options): Promise<LanguageModelV3StreamResult> {
      const result = await execute(options), text = completed(result), id = crypto.randomUUID()
      const parts: any[] = [{ type: "stream-start", warnings: warnings(options) }, { type: "response-metadata", id: result.jobId, modelId: target.id, timestamp: new Date() }, { type: "text-start", id }, { type: "text-delta", id, delta: text }, { type: "text-end", id }, { type: "finish", finishReason: finish(result), usage: usage(result), providerMetadata: { herdr: { targetId: target.id, delegatedTools: result.delegatedTools } } }]
      return { stream: new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } }) }
    },
  }
}
