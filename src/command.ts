import { HerdrError } from "./errors.js"
import type { Target } from "./adapters/types.js"
import type { HerdrController } from "./controller.js"
import { tool } from "@opencode-ai/plugin"

export function validatePaneInput(targets: Target[], targetId: string, task: string) {
  const target = targets.find((item) => item.id === targetId)
  if (!target) throw new HerdrError("target unavailable")
  if (!task.trim()) throw new HerdrError("task is required")
  return { target, task }
}

export function herdrTools(targets: () => Target[], controller: () => HerdrController, refresh?: () => Promise<void>, available: () => boolean = () => true) {
  return {
    herdr_capabilities: tool({ description: "List executable Herdr targets", args: {}, async execute() { await refresh?.(); if (!available()) throw new HerdrError("Herdr unavailable"); return JSON.stringify(targets().map(({ id, name, provenance, toolCall }) => ({ id, name, provenance, toolCall }))) } }),
    herdr_pane: tool({ description: "Delegate an explicit task to a Herdr target", args: { target: tool.schema.string(), task: tool.schema.string() }, async execute(args) {
      if (!available()) throw new HerdrError("Herdr unavailable")
      const input = validatePaneInput(targets(), args.target, args.task)
      const result = await controller().execute(input.target, { prompt: [{ role: "user", content: [{ type: "text", text: input.task }] }] } as any)
      if (result.status !== "done") throw new HerdrError(result.diagnostic || "Herdr task failed")
      return { title: input.target.name, output: result.text ?? "", metadata: { targetId: input.target.id, delegatedTools: result.delegatedTools } }
    } }),
  }
}
