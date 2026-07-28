import { expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { adapterArgv, effortFromCallOptions, normalizeEffort } from "../src/effort"
import { createJob } from "../src/job"
import { targetsToModels } from "../src/opencode-config"
import type { Target } from "../src/adapters/types"

test("effortFromCallOptions reads herdr/opencode bags", () => {
  expect(effortFromCallOptions({ providerOptions: { herdr: { variant: "high" } } } as any)).toBe("high")
  expect(effortFromCallOptions({ providerOptions: { openai: { reasoningEffort: "max" } } } as any)).toBe("max")
  expect(effortFromCallOptions({ providerOptions: { herdr: { effort: "  low  " } } } as any)).toBe("low")
  expect(effortFromCallOptions({ providerOptions: { herdr: { variant: "" } } } as any)).toBeUndefined()
  expect(effortFromCallOptions({} as any)).toBeUndefined()
})

test("adapterArgv maps effort per runtime", () => {
  expect(adapterArgv("claude", "opus", "do it", "high")).toEqual([
    "claude", "-p", "--output-format", "stream-json", "--model", "opus", "--effort", "high", "--", "do it",
  ])
  expect(adapterArgv("codex", "gpt-5.6-sol", "do it", "ultra")).toEqual([
    "codex", "exec", "--json", "--model", "gpt-5.6-sol", "-c", "model_reasoning_effort=ultra", "--", "do it",
  ])
  expect(adapterArgv("opencode", "openai/gpt", "do it", "max")).toEqual([
    "opencode", "run", "--format", "json", "--model", "openai/gpt", "--variant", "max", "--", "do it",
  ])
  expect(adapterArgv("cursor", "composer-2.5", "do it", "high")).toEqual([
    "agent", "-p", "--output-format", "stream-json", "--model", "composer-2.5[effort=high]", "--", "do it",
  ])
  expect(adapterArgv("claude", "opus", "do it")).toEqual([
    "claude", "-p", "--output-format", "stream-json", "--model", "opus", "--", "do it",
  ])
  expect(normalizeEffort("")).toBeUndefined()
})

test("adapterArgv puts -- before dash-leading skill frontmatter prompts", () => {
  const skill = "---\nname: sdd-tasks\n---\nDo the work"
  for (const [adapter, model] of [
    ["cursor", "cursor-grok-4.5-high"],
    ["claude", "haiku"],
    ["codex", "gpt-5.6-sol"],
    ["opencode", "openai/gpt-5.6-sol"],
  ] as const) {
    const argv = adapterArgv(adapter, model, skill)
    expect(argv.at(-2)).toBe("--")
    expect(argv.at(-1)).toBe(skill)
    expect(argv.includes("-") && adapter === "codex").toBeFalse()
  }
})

test("createJob persists effort in request.json", async () => {
  const root = await mkdtemp("/tmp/herdr-effort-")
  const job = await createJob("task", root, { effort: "high" })
  const body = JSON.parse(await readFile(job.request, "utf8"))
  expect(body.task).toBe("task")
  expect(body.effort).toBe("high")
})

test("targetsToModels exposes OpenCode variants from efforts", () => {
  const target: Target = {
    id: "codex-x",
    name: "codex gpt",
    adapter: "codex",
    nativeModel: "gpt-5.6-sol",
    provenance: "known",
    limits: { context: 1, output: 1 },
    toolCall: true,
    efforts: ["low", "high"],
    defaultEffort: "low",
  }
  const models = targetsToModels([target])
  expect(models["codex-x"].variants).toEqual({ low: {}, high: {} })
  expect(models["codex-x"].options.efforts).toEqual(["low", "high"])
})
