import { HerdrError } from "./errors.js"
import type { Target } from "./adapters/types.js"
import { adapterFor } from "./adapters/types.js"
import type { HerdrController } from "./controller.js"
import { tool } from "@opencode-ai/plugin"

/** Resolve adapter id (cursor|…) or full target id to a Target. */
export function resolvePaneTarget(targets: Target[], runtime: string) {
  const id = runtime.trim()
  if (!id) throw new HerdrError("runtime is required")
  if (adapterFor(id)) {
    const matches = targets.filter((item) => item.adapter === id)
    if (!matches.length) throw new HerdrError(`runtime unavailable: ${id}`)
    return matches.find((item) => item.provenance === "verified") ?? matches[0]!
  }
  const asTarget = targets.find((item) => item.id === id)
  if (asTarget) return asTarget
  throw new HerdrError(`unknown runtime: ${id}`)
}

export function herdrTools(
  targets: () => Target[],
  controller: () => HerdrController,
  refresh?: () => Promise<void>,
  available: () => boolean = () => true,
) {
  return {
    herdr_capabilities: tool({ description: "List executable Herdr targets", args: {}, async execute() { await refresh?.(); if (!available()) throw new HerdrError("Herdr unavailable"); return JSON.stringify(targets().map(({ id, name, adapter, provenance, toolCall }) => ({ id, name, adapter, provenance, toolCall }))) } }),
    herdr_pane: tool({
      description: "Delegate an explicit task to a Herdr runtime (adapter or target id)",
      args: { runtime: tool.schema.string(), task: tool.schema.string() },
      async execute(args) {
        if (!available()) throw new HerdrError("Herdr unavailable")
        if (!args.task.trim()) throw new HerdrError("task is required")
        const target = resolvePaneTarget(targets(), args.runtime)
        const result = await controller().execute(target, { prompt: [{ role: "user", content: [{ type: "text", text: args.task }] }] } as any)
        if (result.status !== "done") throw new HerdrError(result.diagnostic || "Herdr task failed")
        return { title: target.name, output: result.text ?? "", metadata: { targetId: target.id, runtime: target.adapter, delegatedTools: result.delegatedTools } }
      },
    }),
  }
}
