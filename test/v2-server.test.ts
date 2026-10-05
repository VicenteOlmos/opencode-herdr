import { describe, expect, test } from "bun:test"
import { HerdrPlugin } from "../src/index.js"
import { targetsToProviderModels } from "../src/opencode-config.js"
import { createV2Context } from "./v2-context.js"

describe("OpenCode V2 server plugin contract", () => {
  test("exports the native setup entrypoint", () => {
    expect(typeof HerdrPlugin.setup).toBe("function")
    expect("server" in HerdrPlugin).toBeFalse()
  })

  test("applies effort overlays only to targets advertising efforts", () => {
    const withEffort = {
      id: "herdr/cursor/agent",
      name: "cursor agent",
      adapter: "cursor",
      nativeModel: "agent",
      provenance: "verified" as const,
      limits: { context: 1, output: 1 },
      toolCall: false,
      efforts: ["high"],
    }
    const withoutEffort = {
      ...withEffort,
      id: "herdr/claude/sonnet",
      adapter: "claude",
      nativeModel: "sonnet",
      efforts: undefined,
    }
    const models = targetsToProviderModels([withEffort, withoutEffort])
    expect(models[0]?.variants.map((variant) => ({ id: String(variant.id), settings: variant.settings })))
      .toEqual([{ id: "high", settings: { effort: "high" } }])
    expect(models[1]?.variants).toEqual([])
  })

  test("registers provider models, AI SDK model, tools, commands, and agent routing", async () => {
    const { registrations, target, cleanup } = await createV2Context(HerdrPlugin)
    try {
      const provider = registrations.providers[0] as any

      expect(provider.info.id).toBe("herdr")
      expect(provider.info.package).toBe("opencode-herdr")
      expect(provider.models[0].id).toBe("cursor/agent")
      expect(provider.models[0].variants).toEqual([
        { id: "low", settings: { effort: "low" } },
        { id: "high", settings: { effort: "high" } },
      ])
      expect(provider.models[0].capabilities.tools).toBeTrue()
      expect(registrations.tools.map((tool: any) => tool.name)).toEqual(["herdr_capabilities", "herdr_pane"])
      expect(registrations.commands.map((command: any) => command.name)).toEqual([
        "herdr-pane", "herdr-handover", "herdr-status", "herdr-test", "herdr-delete",
      ])
      expect(registrations.agents.get("build")?.model).toEqual({
        providerID: "herdr",
        id: "cursor/agent",
        variant: "high",
      })

      const sdkEvent: { model: { providerID: string; id: string }; sdk?: { languageModel: (id: string) => unknown } } = {
        model: { providerID: "herdr", id: "cursor/agent" },
      }
      registrations.sdk.forEach((hook) => hook(sdkEvent))
      const languageEvent: { model: { providerID: string; id: string; modelID: string }; options: { effort: string }; language?: { specificationVersion: string; modelId: string } } = {
        model: { ...sdkEvent.model, id: "catalog-alias", modelID: "cursor/agent" },
        options: { effort: "high" },
      }
      registrations.language.forEach((hook) => hook(languageEvent))
      expect(typeof sdkEvent.sdk?.languageModel).toBe("function")
      expect(languageEvent.language?.specificationVersion).toBe("v3")
      expect(languageEvent.language?.modelId).toBe("herdr/cursor/agent")
      expect(target.id).toBe("herdr/cursor/agent")

      const unrelatedEvent: typeof languageEvent = {
        model: { ...languageEvent.model, providerID: "openai" },
        options: { effort: "high" },
      }
      registrations.language.forEach((hook) => hook(unrelatedEvent))
      expect(unrelatedEvent.language).toBeUndefined()
    } finally {
      await cleanup()
    }
  })

  test("propagates synthetic feedback failures from mechanical commands", async () => {
    const { registrations, cleanup } = await createV2Context(HerdrPlugin, {
      syntheticError: new Error("synthetic transport failed"),
    })
    try {
      const status = registrations.commands.find((command: any) => command.name === "herdr-status") as any
      await expect(status.execute({ sessionID: "session" })).rejects.toThrow("synthetic transport failed")
    } finally {
      await cleanup()
    }
  })

  test("does not reload providers after a deferred refresh resolves after unload", async () => {
    const context = await createV2Context(HerdrPlugin, { holdRefresh: true })
    try {
      expect(context.spawnCalls).toBeGreaterThan(0)
      await context.unload()
      context.releaseRefresh()
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(context.reloadCalls).toBe(0)
    } finally {
      await context.cleanup()
    }
  })

  test("reports background provider reload failures without failing setup", async () => {
    const context = await createV2Context(HerdrPlugin, {
      holdRefresh: true,
      reloadError: new Error("provider reload failed"),
    })
    const errors: unknown[][] = []
    const originalError = console.error
    console.error = (...values: unknown[]) => { errors.push(values) }
    try {
      expect(context.spawnCalls).toBeGreaterThan(0)
      context.releaseRefresh()
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(context.reloadCalls).toBe(1)
      expect(errors).toContainEqual(["[herdr] background refresh failed:", "provider reload failed"])
    } finally {
      console.error = originalError
      await context.cleanup()
    }
  })
})
