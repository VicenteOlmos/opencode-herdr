import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import { adapterFor } from "./adapters/types.js"
import { HerdrError } from "./errors.js"

const EFFORT_KEYS = ["variant", "effort", "reasoningEffort", "reasoning_effort"] as const

/** Pull OpenCode agent.variant / provider effort out of an AI SDK call. */
export function effortFromCallOptions(options: LanguageModelV3CallOptions | undefined): string | undefined {
  const anyOpts = options as (LanguageModelV3CallOptions & { variant?: unknown; effort?: unknown }) | undefined
  const direct = normalizeEffort(anyOpts?.variant ?? anyOpts?.effort)
  if (direct) return direct
  const po = options?.providerOptions
  if (!po || typeof po !== "object") return undefined
  // Prefer herdr bag, then any provider bag.
  const bags = [
    (po as Record<string, unknown>).herdr,
    (po as Record<string, unknown>).opencode,
    ...Object.values(po as Record<string, unknown>),
  ]
  for (const bag of bags) {
    if (!bag || typeof bag !== "object" || Array.isArray(bag)) continue
    const record = bag as Record<string, unknown>
    for (const key of EFFORT_KEYS) {
      const value = record[key]
      if (typeof value === "string" && value.trim()) return value.trim()
    }
  }
  return undefined
}

export function normalizeEffort(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

/**
 * Build adapter argv with model + optional effort flags.
 * Task is always the final positional after `--` so prompts starting with `-`
 * (e.g. skill YAML frontmatter `---`) are not parsed as CLI options.
 */
export function adapterArgv(adapterId: string, nativeModel: string, task: string, effort?: string): string[] {
  const adapter = adapterFor(adapterId)
  if (!adapter) throw new HerdrError("unsupported adapter")
  const level = normalizeEffort(effort)
  const cmd = [...adapter.command]
  const end = ["--", task] as const
  switch (adapter.id) {
    case "claude":
      return level
        ? [...cmd, "--model", nativeModel, "--effort", level, ...end]
        : [...cmd, "--model", nativeModel, ...end]
    case "codex": {
      // adapter.command includes stdin placeholder `-`; drop it when the task is positional.
      const base = cmd.filter((arg) => arg !== "-")
      return level
        ? [...base, "--model", nativeModel, "-c", `model_reasoning_effort=${level}`, ...end]
        : [...base, "--model", nativeModel, ...end]
    }
    case "opencode":
      return level
        ? [...cmd, "--model", nativeModel, "--variant", level, ...end]
        : [...cmd, "--model", nativeModel, ...end]
    case "cursor": {
      // Cursor Agent accepts parameterized models: model[effort=high]
      const model =
        level && !nativeModel.includes("[")
          ? `${nativeModel}[effort=${level}]`
          : nativeModel
      return [...cmd, "--model", model, ...end]
    }
    default:
      return [...cmd, "--model", nativeModel, ...end]
  }
}
