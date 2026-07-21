import type { Target } from "./adapters/types.js"
import { HerdrError } from "./errors.js"

export function targetsToModels(targets: Target[]) {
  return Object.fromEntries(targets.map((target) => [target.id, {
    id: target.id, name: target.name, provider: { npm: "opencode-herdr", api: "herdr" }, tool_call: target.toolCall,
    modalities: { input: ["text"], output: ["text"] }, limit: target.limits, status: "active",
    cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 }, options: { adapter: target.adapter, nativeModel: target.nativeModel, provenance: target.provenance },
  }]))
}
export type RuntimeContext = { cwd: string; workspace: string; tab: string; pane: string }
export function injectConfig(config: any, targets: Target[], runtime: RuntimeContext) {
  if (config.provider?.herdr) throw new HerdrError("provider herdr already exists")
  if (config.command?.["herdr-pane"]) throw new HerdrError("command herdr-pane already exists")
  ;(config.provider ??= {}).herdr = { name: "Herdr", npm: "opencode-herdr", options: { targets, ...runtime }, models: targetsToModels(targets) }
  ;(config.command ??= {})["herdr-pane"] = { description: "Delegate task through a Herdr target", template: "Use herdr_capabilities. Parse $ARGUMENTS as <target> <task>. If no target, ask target with question. If no task, ask task with question. If both target and task are supplied, do not question. Revalidate then call herdr_pane with explicit target and task." }
}
