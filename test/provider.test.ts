import { expect, test } from "bun:test"
import { injectConfig, targetsToModels } from "../src/opencode-config"
import { createHerdr } from "../src/provider"

const target = { id: "cursor-agent", name: "Cursor agent", adapter: "cursor", nativeModel: "agent", provenance: "verified" as const, limits: { context: 1, output: 1 }, toolCall: true as const, toolMode: "delegated-agent" as const }

test("R1 injects exact custom provider npm contract", () => {
  const config: any = {}
  injectConfig(config, [target], { cwd: "/tmp/project", workspace: "w", tab: "t", pane: "p" })
  expect(config.provider.herdr.models["cursor-agent"].provider).toEqual({ npm: "opencode-herdr", api: "herdr" })
  expect(config.provider.herdr.options.targets).toEqual([target])
  expect(config.provider.herdr.options).toMatchObject({ cwd: "/tmp/project", workspace: "w", tab: "t", pane: "p" })
  expect(targetsToModels([target])["cursor-agent"].tool_call).toBeTrue()
})

test("R2 exact model routing rejects substitutions", () => {
  expect(createHerdr({ targets: [target] }).languageModel("cursor-agent").modelId).toBe("cursor-agent")
  expect(() => createHerdr({ targets: [target] }).languageModel("cursor-other")).toThrow("unavailable")
})
