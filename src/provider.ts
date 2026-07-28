import type { LanguageModelV3, LanguageModelV3CallOptions } from "@ai-sdk/provider"
import type { Target } from "./adapters/types.js"
import { resolveTarget } from "./adapters/types.js"
import { HerdrError } from "./errors.js"
import { createLanguageModel } from "./language-model.js"
import type { JobResultV1 } from "./job.js"
import { HerdrController } from "./controller.js"

export type HerdrOptions = { targets?: Target[]; execute?: (target: Target, options: LanguageModelV3CallOptions) => Promise<JobResultV1>; controller?: HerdrController; root?: string; cwd?: string; workspace?: string; tab?: string; pane?: string; keepPanes?: boolean; keepJobs?: boolean; debug?: boolean }
export function createHerdr(options: HerdrOptions = {}) {
  const targets = options.targets ?? []
  return { languageModel(modelID: string): LanguageModelV3 {
    const target = resolveTarget(targets, modelID)
    if (!target) throw new HerdrError(`Herdr target unavailable: ${modelID}`, "TARGET_UNAVAILABLE")
    const controller = options.controller ?? new HerdrController(options)
    return createLanguageModel(target, (input) => options.execute ? options.execute(target, input) : controller.execute(target, input))
  } }
}
