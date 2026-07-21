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
}

export type Limits = { context: number; output: number }
export type DiscoveredModel = { id: string; limits?: Limits }

export type Adapter = {
  id: string
  command: string[]
  modelsArg: string[]
  toolCall: boolean
  limits: Limits
  parseModels(stdout: string): DiscoveredModel[]
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

export const adapters: Adapter[] = [
  { id: "cursor", command: ["agent", "-p", "--output-format", "stream-json"], modelsArg: ["agent", "models", "--json"], toolCall: true, limits: { context: 128_000, output: 16_384 }, parseModels: jsonModels },
  { id: "opencode", command: ["opencode", "run", "--format", "json"], modelsArg: ["opencode", "models", "--verbose", "--json"], toolCall: true, limits: { context: 128_000, output: 16_384 }, parseModels: jsonModels },
  { id: "claude", command: ["claude", "-p", "--output-format", "stream-json"], modelsArg: ["claude", "models", "--json"], toolCall: true, limits: { context: 200_000, output: 8_192 }, parseModels: jsonModels },
  { id: "codex", command: ["codex", "exec", "-", "--json"], modelsArg: ["codex", "models", "--json"], toolCall: true, limits: { context: 128_000, output: 16_384 }, parseModels: jsonModels },
]

export const adapterFor = (id: string) => adapters.find((adapter) => adapter.id === id)
export const targetId = (adapter: string, model: string) => `${adapter}-${Buffer.from(model).toString("base64url")}`
