import { homedir } from "node:os"
import { join } from "node:path"
import { readFile } from "node:fs/promises"

export type Provenance = "verified" | "known" | "unknown"

export type Target = {
  id: string
  name: string
  adapter: string
  nativeModel: string
  provenance: Exclude<Provenance, "unknown">
  limits: { context: number; output: number }
  toolCall: boolean
  toolMode?: "delegated-agent"
  /** Reasoning effort / OpenCode variant values advertised by the runtime catalog. */
  efforts?: string[]
  defaultEffort?: string
}

export type Limits = { context: number; output: number }
export type DiscoveredModel = {
  id: string
  limits?: Limits
  efforts?: string[]
  defaultEffort?: string
}

export type Adapter = {
  id: string
  command: string[]
  modelsArg: string[]
  toolCall: boolean
  limits: Limits
  /** Gate / CLI parse. When `listModels` is set, a non-empty parse only means “binary present”. */
  parseModels(stdout: string): DiscoveredModel[]
  /** Optional catalog when the CLI has no real `models` subcommand. */
  listModels?: () => DiscoveredModel[] | Promise<DiscoveredModel[]>
  /** Provenance for `listModels` catalogs (default: known). */
  modelProvenance?: Exclude<Provenance, "unknown">
}

const jsonModels = (stdout: string): DiscoveredModel[] => {
  try {
    const value = JSON.parse(stdout) as { models?: unknown }
    return Array.isArray(value.models) ? value.models.flatMap((model) => {
      if (typeof model === "string") return [{ id: model }]
      if (!model || typeof model !== "object" || typeof (model as { id?: unknown }).id !== "string") return []
      const limits = (model as { limits?: unknown }).limits
      return [{ id: (model as { id: string }).id, ...(limits && typeof limits === "object" && typeof (limits as Limits).context === "number" && typeof (limits as Limits).output === "number" ? { limits: limits as Limits } : {}) }]
    }) : []
  } catch {
    return []
  }
}

/** Cursor Agent: `auto - Auto (default)` lines (no --json on current CLIs). */
export const agentTextModels = (stdout: string): DiscoveredModel[] => {
  const models: DiscoveredModel[] = []
  for (const line of stdout.split("\n")) {
    const match = line.match(/^(\S+)\s+-\s+(.+)$/)
    if (match?.[1]) models.push({ id: match[1] })
  }
  return models
}

/** OpenCode: one `provider/model` (or bare id) per line. */
export const opencodeTextModels = (stdout: string): DiscoveredModel[] => {
  const models: DiscoveredModel[] = []
  for (const line of stdout.split("\n")) {
    const id = line.trim()
    if (!id || id.includes(" ") || id.startsWith("-") || !id.includes("/")) continue
    models.push({ id })
  }
  return models
}

/**
 * OpenCode's `models` dump includes every configured provider — including `herdr/*`
 * after we inject the custom provider. Re-ingesting those creates a feedback loop
 * (thousands of fake opencode targets) and breaks the model picker.
 */
export function filterOpencodeDiscovered(models: DiscoveredModel[]): DiscoveredModel[] {
  return models.filter((model) => !model.id.startsWith("herdr/"))
}

const preferJsonThen = (fallback: (stdout: string) => DiscoveredModel[]) => (stdout: string) => {
  const json = jsonModels(stdout)
  return json.length ? json : fallback(stdout)
}

const parseOpencodeModels = (stdout: string): DiscoveredModel[] =>
  filterOpencodeDiscovered(preferJsonThen(opencodeTextModels)(stdout))

/** Version stdout contains a semver-ish number → binary present. */
export const versionPresent = (stdout: string): DiscoveredModel[] => (/\d+\.\d+/.test(stdout) ? [{ id: "__present__" }] : [])

/** Claude Code `--effort` values from CLI help. */
export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const

/** Claude Code documented aliases + full IDs seen in local usage cache. */
export const CLAUDE_MODEL_ALIASES = ["fable", "opus", "sonnet", "haiku"] as const

export async function claudeModels(home = homedir()): Promise<DiscoveredModel[]> {
  const ids = new Set<string>(CLAUDE_MODEL_ALIASES)
  try {
    const raw = await readFile(join(home, ".claude", "stats-cache.json"), "utf8")
    const data = JSON.parse(raw) as { modelUsage?: Record<string, unknown> }
    for (const id of Object.keys(data.modelUsage ?? {})) {
      if (id.trim()) ids.add(id.trim())
    }
  } catch {
    // optional cache
  }
  try {
    const raw = await readFile(join(home, ".claude", "settings.json"), "utf8")
    const data = JSON.parse(raw) as { model?: unknown }
    if (typeof data.model === "string" && data.model.trim()) {
      const base = data.model.trim().replace(/\[[^\]]+\]$/, "")
      if (base) ids.add(base)
    }
  } catch {
    // optional settings
  }
  const efforts = [...CLAUDE_EFFORTS]
  return [...ids].map((id) => ({ id, efforts }))
}

function effortsFromCodexLevels(levels: unknown): string[] {
  if (!Array.isArray(levels)) return []
  const out: string[] = []
  for (const level of levels) {
    if (typeof level === "string" && level.trim()) out.push(level.trim())
    else if (level && typeof level === "object" && typeof (level as { effort?: unknown }).effort === "string") {
      const effort = (level as { effort: string }).effort.trim()
      if (effort) out.push(effort)
    }
  }
  return [...new Set(out)]
}

/** Codex: slugs from ~/.codex/models_cache.json (or $CODEX_HOME). */
export async function codexModels(home = process.env.CODEX_HOME?.trim() || join(homedir(), ".codex")): Promise<DiscoveredModel[]> {
  try {
    const raw = await readFile(join(home, "models_cache.json"), "utf8")
    const data = JSON.parse(raw) as {
      models?: Array<{
        slug?: unknown
        visibility?: unknown
        context_window?: unknown
        max_context_window?: unknown
        supported_reasoning_levels?: unknown
        default_reasoning_level?: unknown
      }>
    }
    const out: DiscoveredModel[] = []
    const seen = new Set<string>()
    for (const model of data.models ?? []) {
      if (typeof model.slug !== "string" || !model.slug.trim() || seen.has(model.slug)) continue
      // Codex marks internal models (e.g. codex-auto-review guardian) as hide.
      if (model.visibility === "hide") continue
      seen.add(model.slug)
      const context =
        typeof model.max_context_window === "number"
          ? model.max_context_window
          : typeof model.context_window === "number"
            ? model.context_window
            : undefined
      const efforts = effortsFromCodexLevels(model.supported_reasoning_levels)
      const defaultEffort =
        typeof model.default_reasoning_level === "string" && model.default_reasoning_level.trim()
          ? model.default_reasoning_level.trim()
          : undefined
      out.push({
        id: model.slug,
        ...(context ? { limits: { context, output: 16_384 } } : {}),
        ...(efforts.length ? { efforts } : {}),
        ...(defaultEffort ? { defaultEffort } : {}),
      })
    }
    return out
  } catch {
    return []
  }
}

function effortsFromReasoningOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const entry = item as { type?: unknown; values?: unknown }
    if (entry.type !== "effort" || !Array.isArray(entry.values)) continue
    return [...new Set(entry.values.filter((v): v is string => typeof v === "string" && v.trim().length > 0))]
  }
  return []
}

/** Attach OpenCode models.dev effort values from ~/.cache/opencode/models.json when present. */
export async function enrichOpencodeEfforts(
  models: DiscoveredModel[],
  cachePath = join(homedir(), ".cache", "opencode", "models.json"),
): Promise<DiscoveredModel[]> {
  let catalog: Record<string, { models?: Record<string, { reasoning_options?: unknown }> }>
  try {
    catalog = JSON.parse(await readFile(cachePath, "utf8")) as typeof catalog
  } catch {
    return models
  }
  return models.map((model) => {
    const slash = model.id.indexOf("/")
    if (slash <= 0) return model
    const provider = model.id.slice(0, slash)
    const mid = model.id.slice(slash + 1)
    const efforts = effortsFromReasoningOptions(catalog[provider]?.models?.[mid]?.reasoning_options)
    return efforts.length ? { ...model, efforts } : model
  })
}

/** Fill missing Claude efforts; enrich OpenCode from models.dev cache. */
export async function enrichModelEfforts(adapterId: string, models: DiscoveredModel[]): Promise<DiscoveredModel[]> {
  if (adapterId === "claude") {
    const efforts = [...CLAUDE_EFFORTS]
    return models.map((model) => (model.efforts?.length ? model : { ...model, efforts }))
  }
  if (adapterId === "opencode") return enrichOpencodeEfforts(models)
  return models
}

export const adapters: Adapter[] = [
  { id: "cursor", command: ["agent", "-p", "--output-format", "stream-json"], modelsArg: ["agent", "models"], toolCall: true, limits: { context: 128_000, output: 16_384 }, parseModels: preferJsonThen(agentTextModels) },
  { id: "opencode", command: ["opencode", "run", "--format", "json"], modelsArg: ["opencode", "models", "--pure"], toolCall: true, limits: { context: 128_000, output: 16_384 }, parseModels: parseOpencodeModels },
  {
    id: "claude",
    command: ["claude", "-p", "--output-format", "stream-json"],
    modelsArg: ["claude", "--version"],
    toolCall: true,
    limits: { context: 200_000, output: 8_192 },
    parseModels: versionPresent,
    listModels: () => claudeModels(),
    modelProvenance: "known",
  },
  {
    id: "codex",
    command: ["codex", "exec", "-", "--json"],
    modelsArg: ["codex", "--version"],
    toolCall: true,
    limits: { context: 128_000, output: 16_384 },
    parseModels: versionPresent,
    listModels: () => codexModels(),
    modelProvenance: "known",
  },
]

export const adapterFor = (id: string) => adapters.find((adapter) => adapter.id === id)

/**
 * Stable OpenCode model key under provider `herdr`.
 * Readable form: `<adapter>/<nativeModel>` → config `herdr/cursor/composer-2.5`.
 * (Legacy was `<adapter>-<base64url(native)>`; still resolved via parseTargetId.)
 */
export const targetId = (adapter: string, model: string) => `${adapter}/${model}`

/** Pre-readable opaque ids — kept for migration / lookup only. */
export const legacyTargetId = (adapter: string, model: string) =>
  `${adapter}-${Buffer.from(model).toString("base64url")}`

/** Parse `cursor/composer-2.5` or legacy `cursor-Y29tcG9zZXItMi41`. */
export function parseTargetId(id: string): { adapter: string; nativeModel: string } | null {
  const trimmed = id.trim()
  if (!trimmed) return null
  const slash = trimmed.indexOf("/")
  if (slash > 0) {
    const adapter = trimmed.slice(0, slash)
    const nativeModel = trimmed.slice(slash + 1)
    if (!adapter || !nativeModel) return null
    return { adapter, nativeModel }
  }
  const dash = trimmed.indexOf("-")
  if (dash <= 0) return null
  const adapter = trimmed.slice(0, dash)
  const b64 = trimmed.slice(dash + 1)
  try {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4)
    const nativeModel = Buffer.from(b64 + pad, "base64url").toString("utf8")
    if (!nativeModel) return null
    return { adapter, nativeModel }
  } catch {
    return null
  }
}

/** `herdr/<id>` → canonical `herdr/<adapter>/<nativeModel>` (no-op if already). */
export function canonicalizeHerdrModelRef(ref: string): string {
  if (!ref.startsWith("herdr/")) return ref
  const id = ref.slice("herdr/".length)
  if (id.includes("/")) return ref
  const parsed = parseTargetId(id)
  if (!parsed) return ref
  // Only rewrite verified legacy base64 ids.
  if (legacyTargetId(parsed.adapter, parsed.nativeModel) !== id) return ref
  return `herdr/${targetId(parsed.adapter, parsed.nativeModel)}`
}

export function resolveTarget(targets: readonly Target[], modelID: string): Target | undefined {
  // OpenCode may pass provider-qualified ids (`herdr/cursor/…`) or bare target ids.
  const id = modelID.startsWith("herdr/") ? modelID.slice("herdr/".length) : modelID
  const direct = targets.find((candidate) => candidate.id === id)
  if (direct) return direct
  const parsed = parseTargetId(id)
  if (!parsed) return undefined
  return (
    targets.find((t) => t.adapter === parsed.adapter && t.nativeModel === parsed.nativeModel)
    ?? targets.find((t) => t.id === targetId(parsed.adapter, parsed.nativeModel))
    ?? targets.find((t) => t.id === legacyTargetId(parsed.adapter, parsed.nativeModel))
  )
}

export function interactiveArgv(adapterId: string, directory: string): string[] {
  const adapter = adapterFor(adapterId)
  if (!adapter) throw new Error(`unknown runtime: ${adapterId}`)
  switch (adapter.id) {
    case "cursor":
      return ["agent", "--workspace", directory]
    case "opencode":
      return ["opencode", directory]
    case "claude":
      return ["claude"]
    case "codex":
      return ["codex"]
    default:
      return [adapter.command[0]!]
  }
}

/** Herdr `agent start --kind` mapping + args after `--`. */
export function herdrKindLaunch(adapterId: string, directory: string): { kind: string; args: string[] } {
  const adapter = adapterFor(adapterId)
  if (!adapter) throw new Error(`unknown runtime: ${adapterId}`)
  switch (adapter.id) {
    case "cursor":
      // --trust skips the workspace trust TUI which blocks prompts on first open.
      return { kind: "cursor", args: ["--workspace", directory, "--trust"] }
    case "opencode":
      return { kind: "opencode", args: [directory] }
    case "claude":
      return { kind: "claude", args: [] }
    case "codex":
      return { kind: "codex", args: [] }
    default:
      return { kind: adapter.id, args: [] }
  }
}

export function availableRuntimes(ids = adapters.map((adapter) => adapter.id)) {
  return ids.filter((id) => {
    const adapter = adapterFor(id)
    return adapter ? Boolean(Bun.which(adapter.command[0]!)) : false
  })
}
