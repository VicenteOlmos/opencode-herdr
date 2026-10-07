import { HerdrError } from "./errors.js"
import type { Target } from "./adapters/types.js"
import { adapterFor } from "./adapters/types.js"
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import type { HerdrController } from "./controller.js"

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
  controller: (sessionID: string) => Promise<HerdrController>,
  refresh?: () => Promise<void>,
  available: () => boolean = () => true,
) {
  return {
    herdr_capabilities: {
      name: "herdr_capabilities",
      description: "List executable Herdr targets",
      input: { type: "object", properties: {}, additionalProperties: false },
      async execute(_input: unknown, context: { sessionID: string }) {
        await refresh?.()
        if (!available()) throw new HerdrError("Herdr unavailable")
        return { content: JSON.stringify(targets().map(({ id, name, adapter, provenance, toolCall }) => ({ id, name, adapter, provenance, toolCall }))) }
      },
    },
    herdr_pane: {
      name: "herdr_pane",
      description: "Delegate an explicit task to a Herdr runtime (adapter or target id)",
      input: {
        type: "object",
        properties: { runtime: { type: "string" }, task: { type: "string" } },
        required: ["runtime", "task"],
        additionalProperties: false,
      },
      async execute(input: unknown, context: { sessionID: string }) {
        if (!available()) throw new HerdrError("Herdr unavailable")
        if (!input || typeof input !== "object") throw new HerdrError("invalid tool input")
        const { runtime, task } = input as { runtime?: unknown; task?: unknown }
        if (typeof runtime !== "string" || typeof task !== "string") throw new HerdrError("invalid tool input")
        if (!task.trim()) throw new HerdrError("task is required")
        const target = resolvePaneTarget(targets(), runtime)
        const options: LanguageModelV3CallOptions = {
          prompt: [{ role: "user", content: [{ type: "text", text: task }] }],
        }
        const result = await (await controller(context.sessionID)).execute(target, options)
        if (result.status !== "done") throw new HerdrError(result.diagnostic || "Herdr task failed")
        return {
          content: result.text ?? "",
          metadata: { targetId: target.id, runtime: target.adapter, delegatedTools: result.delegatedTools },
        }
      },
    },
  }
}
