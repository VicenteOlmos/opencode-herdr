import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { Model, Provider } from "@opencode-ai/plugin"
import type { Target } from "./adapters/types.js"
import { HerdrError } from "./errors.js"

/** Absolute `file://` entry so OpenCode can `import` createHerdr without project-local node_modules.
 * Must point at a file (Bun cannot import a package directory via file://). */
export function herdrPackageNpm(): string {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..")
  return pathToFileURL(join(root, "src", "index.ts")).href
}

function isHerdrNpm(npm: string | undefined): boolean {
  if (!npm) return false
  if (npm === "opencode-herdr") return true
  return npm.startsWith("file:") && npm.includes("opencode-herdr")
}

export function targetsToModels(targets: Target[], npm = herdrPackageNpm()) {
  return Object.fromEntries(targets.map((target) => {
    const efforts = target.efforts?.filter((e) => typeof e === "string" && e.trim()) ?? []
    // OpenCode selects agent.variant against model.variants keys and forwards it on the call.
    const variants = efforts.length
      ? Object.fromEntries(efforts.map((effort) => [effort, {}]))
      : undefined
    return [target.id, {
      id: target.id,
      name: target.name,
      provider: { npm, api: "herdr" },
      tool_call: target.toolCall,
      modalities: { input: ["text"], output: ["text"] },
      limit: target.limits,
      status: "active",
      cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
      ...(variants ? { variants } : {}),
      options: {
        adapter: target.adapter,
        nativeModel: target.nativeModel,
        provenance: target.provenance,
        ...(efforts.length ? { efforts } : {}),
        ...(target.defaultEffort ? { defaultEffort: target.defaultEffort } : {}),
      },
    }]
  }))
}

/** Build the native V2 provider source and model definitions. */
export function targetsToProviderModels(targets: Target[]) {
  const providerID = Provider.ID.make("herdr")
  return targets.map((target) => {
    const modelID = target.id.startsWith("herdr/") ? target.id.slice("herdr/".length) : target.id
    const model = Model.Info.default(providerID, Model.ID.make(modelID))
    return {
      ...model,
      name: target.name,
      capabilities: {
        tools: target.toolCall,
        input: ["text"],
        output: ["text"],
      },
      limit: { context: target.limits.context, input: target.limits.context, output: target.limits.output },
      settings: {},
      variants: (target.efforts ?? []).map((effort) => ({
        id: Model.VariantID.make(effort),
        settings: { effort },
      })),
    }
  })
}

export function herdrProviderInfo() {
  return {
    ...Provider.Info.empty(Provider.ID.make("herdr")),
    name: "Herdr",
    activation: "enabled" as const,
    package: `aisdk:${herdrPackageNpm()}`,
  }
}
export type RuntimeContext = {
  cwd: string
  workspace: string
  tab: string
  pane: string
  keepPanes?: boolean
  keepJobs?: boolean
  debug?: boolean
}
export function injectConfig(config: any, targets: Target[], runtime: RuntimeContext) {
  const existing = config.provider?.herdr
  if (existing?.npm && !isHerdrNpm(existing.npm)) throw new HerdrError("provider herdr already exists")
  const npm = herdrPackageNpm()
  // Replace models entirely — merging disk/stale entries caused a multi‑MB feedback loop
  // (thousands of herdr/* ids persisted into opencode.jsonc and reloaded every boot).
  // file:// npm: OpenCode loads createHerdr via import(fileURL); bare "opencode-herdr" fails
  // when the project cwd has no link (ProviderInitError), even if ~/.config/opencode is linked.
  const { keepPanes, keepJobs, debug, ...ctx } = runtime
  ;(config.provider ??= {}).herdr = {
    name: existing?.name ?? "Herdr",
    npm,
    options: {
      targets,
      ...ctx,
      ...(keepPanes ? { keepPanes: true } : {}),
      ...(keepJobs ? { keepJobs: true } : {}),
      ...(debug ? { debug: true } : {}),
    },
    models: targetsToModels(targets, npm),
  }
}

/** Drop ephemeral herdr provider catalog before writing OpenCode config to disk. */
export function stripHerdrProviderForPersist<T extends { provider?: Record<string, any> }>(config: T): T {
  const next = structuredClone(config)
  if (next.provider && "herdr" in next.provider) {
    const { herdr: _drop, ...rest } = next.provider
    if (Object.keys(rest).length) next.provider = rest
    else delete (next as { provider?: unknown }).provider
  }
  return next
}
