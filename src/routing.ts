import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

export const ROUTING_SCHEMA = 1 as const

export type HerdrAssignment = {
  model: string
  /** OpenCode agent.variant. Omitted = leave existing variant alone (legacy). */
  variant?: string
}

export type HerdrRouting = {
  schemaVersion: typeof ROUTING_SCHEMA
  assignments: Record<string, HerdrAssignment>
}

export function defaultRoutingPath(home = homedir()): string {
  const configRoot = process.env.XDG_CONFIG_HOME || join(home, ".config")
  return join(configRoot, "opencode", "herdr-routing.json")
}

export function emptyRouting(): HerdrRouting {
  return { schemaVersion: ROUTING_SCHEMA, assignments: {} }
}

export function isHerdrModel(model: string | undefined | null): boolean {
  return typeof model === "string" && model.startsWith("herdr/")
}

export function normalizeAssignment(raw: unknown): HerdrAssignment | null {
  if (typeof raw === "string" && isHerdrModel(raw)) return { model: canonicalizeModel(raw) }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const model = (raw as { model?: unknown }).model
  if (typeof model !== "string" || !isHerdrModel(model)) return null
  const canonical = canonicalizeModel(model)
  const variant = (raw as { variant?: unknown }).variant
  if (variant === undefined) return { model: canonical }
  if (typeof variant !== "string") return { model: canonical }
  return { model: canonical, variant }
}

/** Rewrite legacy `herdr/adapter-<b64>` → `herdr/adapter/nativeModel`. */
function canonicalizeModel(model: string): string {
  if (!model.startsWith("herdr/")) return model
  const id = model.slice("herdr/".length)
  if (id.includes("/")) return model
  const dash = id.indexOf("-")
  if (dash <= 0) return model
  const adapter = id.slice(0, dash)
  const b64 = id.slice(dash + 1)
  try {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4)
    const nativeModel = Buffer.from(b64 + pad, "base64url").toString("utf8")
    if (!nativeModel) return model
    // Only migrate real legacy ids (round-trip), not arbitrary `adapter-foo` strings.
    const expected = `${adapter}-${Buffer.from(nativeModel).toString("base64url")}`
    if (expected !== id) return model
    return `herdr/${adapter}/${nativeModel}`
  } catch {
    return model
  }
}

export function readRouting(path = defaultRoutingPath()): HerdrRouting {
  if (!existsSync(path)) return emptyRouting()
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<HerdrRouting>
    if (raw?.schemaVersion !== ROUTING_SCHEMA || !raw.assignments || typeof raw.assignments !== "object") return emptyRouting()
    const assignments: Record<string, HerdrAssignment> = {}
    for (const [agent, value] of Object.entries(raw.assignments)) {
      const next = normalizeAssignment(value)
      if (next) assignments[agent] = next
    }
    return { schemaVersion: ROUTING_SCHEMA, assignments }
  } catch {
    return emptyRouting()
  }
}

/** Apply durable Herdr assignments onto OpenCode config (mutates in place for plugin config hook). */
export function applyRoutingInPlace(config: { agent?: Record<string, any> }, routing = readRouting()): number {
  if (!config.agent) config.agent = {}
  let applied = 0
  for (const [agent, assignment] of Object.entries(routing.assignments)) {
    if (!isHerdrModel(assignment.model)) continue
    const model = canonicalizeModel(assignment.model)
    const prev = config.agent[agent]
    const next = { ...(prev ?? {}), model }
    if (assignment.variant !== undefined) next.variant = assignment.variant
    config.agent[agent] = next
    if (prev?.model !== model || (assignment.variant !== undefined && (prev?.variant ?? "") !== assignment.variant)) {
      applied++
    }
  }
  return applied
}
