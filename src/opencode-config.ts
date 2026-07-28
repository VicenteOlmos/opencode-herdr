import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
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
  ;(config.command ??= {})["herdr-pane"] ??= {
    description: "Delegate task through a Herdr runtime. Args: <runtime> <task>",
    template: [
      "Use herdr_capabilities first.",
      "Parse $ARGUMENTS as <runtime> <task>.",
      "Runtime is one of cursor|opencode|claude|codex, or a full target id from herdr_capabilities.",
      "If no runtime, ask runtime with question using available adapters/targets from herdr_capabilities.",
      "If no task, ask task with question.",
      "If both runtime and task are supplied, do not question.",
    ].join(" "),
  }
  ;(config.command ??= {})["herdr-handover"] ??= {
    description: "Hand over to Herdr pane and send context prompt. Args: <runtime> [note]",
    template: "Mechanical handover handled by opencode-herdr. Runtime/note in $ARGUMENTS (or plugin handoverDefault).",
  }
  ;(config.command ??= {})["herdr-status"] ??= {
    description: "Show Herdr availability, runtimes, and target count",
    template: "Mechanical status handled by opencode-herdr.",
  }
  ;(config.command ??= {})["herdr-test"] ??= {
    description: "Create pane, ask agent a random sum, read answer back into this chat",
    template: "Mechanical test handled by opencode-herdr.",
  }
  ;(config.command ??= {})["herdr-delete"] ??= {
    description: "Close all opencode-herdr job panes (oh-*)",
    template: "Mechanical delete handled by opencode-herdr.",
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
