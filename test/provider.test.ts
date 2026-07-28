import { expect, test } from "bun:test"
import { injectConfig, targetsToModels } from "../src/opencode-config"
import { createHerdr } from "../src/provider"

const target = { id: "cursor-agent", name: "Cursor agent", adapter: "cursor", nativeModel: "agent", provenance: "verified" as const, limits: { context: 1, output: 1 }, toolCall: true as const, toolMode: "delegated-agent" as const }

test("R1 injects exact custom provider npm contract and replaces stale models", () => {
  const config: any = {
    provider: {
      herdr: {
        npm: "opencode-herdr",
        models: { "stale-junk": { id: "stale-junk" } },
      },
    },
  }
  injectConfig(config, [target], { cwd: "/tmp/project", workspace: "w", tab: "t", pane: "p" })
  expect(config.provider.herdr.npm).toStartWith("file://")
  expect(config.provider.herdr.npm).toContain("opencode-herdr")
  expect(config.provider.herdr.models["cursor-agent"].provider.npm).toBe(config.provider.herdr.npm)
  expect(config.provider.herdr.models["cursor-agent"].provider.api).toBe("herdr")
  expect(config.provider.herdr.models["stale-junk"]).toBeUndefined()
  expect(config.provider.herdr.options.targets).toEqual([target])
  expect(config.provider.herdr.options).toMatchObject({ cwd: "/tmp/project", workspace: "w", tab: "t", pane: "p" })
  expect(targetsToModels([target])["cursor-agent"].tool_call).toBeTrue()
})

test("R2 exact model routing rejects substitutions", () => {
  expect(createHerdr({ targets: [target] }).languageModel("cursor-agent").modelId).toBe("cursor-agent")
  expect(() => createHerdr({ targets: [target] }).languageModel("cursor-other")).toThrow("unavailable")
})

test("readable herdr/cursor/<model> resolves to cursor runtime target", () => {
  const t = {
    id: "cursor/cursor-grok-4.5-high",
    name: "cursor grok",
    adapter: "cursor",
    nativeModel: "cursor-grok-4.5-high",
    provenance: "verified" as const,
    limits: { context: 1, output: 1 },
    toolCall: false as const,
  }
  const provider = createHerdr({ targets: [t] })
  expect(provider.languageModel("cursor/cursor-grok-4.5-high").modelId).toBe(t.id)
  expect(provider.languageModel("herdr/cursor/cursor-grok-4.5-high").modelId).toBe(t.id)
})
