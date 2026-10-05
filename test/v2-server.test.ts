import { describe, expect, test } from "bun:test"
import { HerdrPlugin } from "../src/index.js"
import { herdrPackageNpm, targetsToProviderModels } from "../src/opencode-config.js"
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

  test("registers native provider models, tools, and agent routing", async () => {
    const { registrations, target, cleanup } = await createV2Context(HerdrPlugin)
    try {
      const provider = registrations.providers[0] as any

      expect(provider.id).toBe("herdr")
      expect(provider.package).toBe(`aisdk:${herdrPackageNpm()}`)
      const model = registrations.models.get("cursor/agent")
      expect(model.id).toBe("cursor/agent")
      expect(model.variants).toEqual([
        { id: "low", settings: { effort: "low" } },
        { id: "high", settings: { effort: "high" } },
      ])
      expect(model.capabilities.tools).toBeTrue()
      expect(registrations.tools.map((tool: any) => tool.name)).toEqual(["herdr_capabilities", "herdr_pane"])
      expect(registrations.commands).toEqual([])
      expect(registrations.agents.get("build")?.model).toEqual({
        providerID: "herdr",
        id: "cursor/agent",
        variant: "high",
      })

      expect(registrations.sdk).toHaveLength(1)
      expect(registrations.language).toHaveLength(1)
      expect(target.id).toBe("herdr/cursor/agent")
    } finally {
      await cleanup()
    }
  })

  test("takes over the beta AISDK provider by its stripped package name", async () => {
    const { registrations, cleanup } = await createV2Context(HerdrPlugin)
    try {
      const hook = registrations.sdk[0]
      const herdr = {
        package: herdrPackageNpm(),
        model: { id: "cursor/agent", modelID: "cursor/agent", providerID: "herdr" },
        options: {},
        sdk: undefined as unknown,
      }
      const unrelated = {
        package: "@ai-sdk/openai",
        model: { id: "gpt-4.1", modelID: "gpt-4.1", providerID: "openai" },
        options: {},
        sdk: undefined as unknown,
      }

      hook?.(herdr)
      hook?.(unrelated)

      expect((herdr.sdk as { languageModel?: unknown } | undefined)?.languageModel).toBeFunction()
      expect(unrelated.sdk).toBeUndefined()

      const languageHook = registrations.language[0]
      const language = {
        model: { id: "cursor/agent", modelID: "cursor/agent", providerID: "herdr" },
        sdk: herdr.sdk,
        options: { effort: "high" },
        language: undefined as unknown,
      }
      languageHook?.(language)
      expect((language.language as { modelId?: unknown } | undefined)?.modelId).toBe("herdr/cursor/agent")
    } finally {
      await cleanup()
    }
  })

  test("does not advertise mechanical slash callbacks as server commands", async () => {
    const { registrations, cleanup } = await createV2Context(HerdrPlugin)
    try { expect(registrations.commands).toEqual([]) } finally { await cleanup() }
  })

  test("binds each Herdr model request to its own session location", async () => {
    const context = await createV2Context(HerdrPlugin, {
      sessionDirectories: {
        "session-one": "/workspaces/one",
        "session-two": "/workspaces/two",
      },
    })
    try {
      const hook = context.registrations.sessionHooks.find((registration) => registration.name === "model.request")?.callback
      expect(hook).toBeFunction()
      const originalHeaders: Record<string, string> = { "X-OpenCode-Herdr-Directory": "/untrusted", "x-opencode-herdr-directory": "/also-untrusted", authorization: "safe" }
      const one = { sessionID: "session-one", model: { providerID: "herdr" }, headers: originalHeaders }
      const two = { sessionID: "session-two", model: { providerID: "herdr" }, headers: {} as Record<string, string> }
      const unrelated = { sessionID: "session-one", model: { providerID: "openai" }, headers: {} as Record<string, string> }
      await Promise.all([hook!(one), hook!(two), hook!(unrelated)])
      expect(one.headers).toEqual({ "x-opencode-herdr-directory": "/workspaces/one", authorization: "safe" })
      expect(originalHeaders).toEqual({ "X-OpenCode-Herdr-Directory": "/untrusted", "x-opencode-herdr-directory": "/also-untrusted", authorization: "safe" })
      expect(two.headers["x-opencode-herdr-directory"]).toBe("/workspaces/two")
      expect(unrelated.headers).toEqual({})
    } finally {
      await context.cleanup()
    }
  })

  test("does not reload providers after a deferred refresh resolves after unload", async () => {
    const context = await createV2Context(HerdrPlugin, { holdRefresh: true })
    try {
      expect(context.spawnCalls).toBeGreaterThan(0)
      const reloadsBeforeUnload = context.reloadCalls
      await context.unload()
      context.releaseRefresh()
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(context.reloadCalls).toBe(reloadsBeforeUnload)
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
      expect(context.reloadCalls).toBe(2)
      expect(errors).toContainEqual(["[herdr] background refresh failed:", "provider reload failed"])
    } finally {
      console.error = originalError
      await context.cleanup()
    }
  })

  test("keeps one catalog transform and removes stale models after discovery refresh", async () => {
    const context = await createV2Context(HerdrPlugin)
    try {
      await new Promise((resolve) => setTimeout(resolve, 25))
      expect(context.registrations.catalogTransforms).toHaveLength(1)
      context.setEmptyModelDiscovery(true)
      const capabilities = context.registrations.tools.find((tool: any) => tool.name === "herdr_capabilities") as any
      await capabilities.execute({}, { sessionID: "session" })
      expect(context.registrations.catalogTransforms).toHaveLength(1)
      expect(context.registrations.models.has("cursor/agent")).toBeFalse()
    } finally {
      await context.cleanup()
    }
  })
})
