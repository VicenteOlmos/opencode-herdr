import { mkdir, rename, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { adapters, type Adapter, type Provenance, type Target, targetId } from "./adapters/types.js"
import { sanitize } from "./sanitize.js"

export type CommandResult = { code: number; stdout: string; stderr?: string }
export type Snapshot = { schemaVersion: 1; createdAt: string; herdr: boolean; stale?: boolean; diagnostic?: string; runtimes: { id: string; provenance: Provenance; diagnostic?: string }[]; targets: Target[] }
export type DiscoveryOptions = { run: (argv: string[]) => Promise<CommandResult>; adapters?: Adapter[]; timeoutMs?: number }

export async function discover({ run, adapters: input = adapters, timeoutMs = 5_000 }: DiscoveryOptions): Promise<Snapshot> {
  const probe = (argv: string[]) => Promise.race([run(argv), new Promise<CommandResult>((resolve) => setTimeout(() => resolve({ code: 1, stdout: "", stderr: "probe timed out" }), timeoutMs))])
  const herdrProbe = await probe(["herdr", "--version"]).catch(() => ({ code: 1, stdout: "", stderr: "Herdr unavailable" }))
  const herdr = herdrProbe.code === 0
  const runtimes: Snapshot["runtimes"] = []
  const targets: Target[] = []
  for (const adapter of input) {
    const result: CommandResult = await probe(adapter.modelsArg).catch(() => ({ code: 1, stdout: "" }))
    const models = result.code === 0 ? adapter.parseModels(result.stdout) : []
    const provenance: Provenance = models.length ? "verified" : "unknown"
    runtimes.push({ id: adapter.id, provenance, ...(provenance === "unknown" ? { diagnostic: sanitize(result.stderr || "unavailable") } : {}) })
    if (herdr) for (const model of models) targets.push({ id: targetId(adapter.id, model.id), name: `${adapter.id} ${model.id}`, adapter: adapter.id, nativeModel: model.id, provenance: "verified", limits: model.limits ?? adapter.limits, toolCall: adapter.toolCall, ...(adapter.toolCall ? { toolMode: "delegated-agent" as const } : {}) })
  }
  return { schemaVersion: 1, createdAt: new Date().toISOString(), herdr, ...(herdr ? {} : { diagnostic: sanitize(herdrProbe.stderr || "Herdr unavailable") }), runtimes, targets }
}

const file = (dir: string) => join(dir.trim(), "capabilities-v1.json")
export async function publishSnapshot(dir: string, snapshot: Snapshot) {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const tmp = `${file(dir)}.${crypto.randomUUID()}.tmp`
  await writeFile(tmp, JSON.stringify(snapshot), { mode: 0o600 })
  await rename(tmp, file(dir))
}
export async function readSnapshot(dir: string): Promise<Snapshot | undefined> {
  try { const value = await Bun.file(file(dir)).json() as Snapshot; return value.schemaVersion === 1 && Array.isArray(value.targets) ? value : undefined } catch { return undefined }
}
export async function refreshSnapshot(dir: string, options: DiscoveryOptions) {
  const fresh = await discover(options)
  if (fresh.herdr) { await publishSnapshot(dir, fresh); return fresh }
  const previous = await readSnapshot(dir)
  if (!previous) return fresh
  const stale = { ...previous, herdr: false, stale: true, diagnostic: `Herdr unavailable: ${fresh.diagnostic ?? "unknown"}`, targets: [] }
  await publishSnapshot(dir, stale)
  return stale
}
