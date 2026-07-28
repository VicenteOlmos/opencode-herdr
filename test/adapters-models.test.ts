import { expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  claudeModels,
  codexModels,
  enrichOpencodeEfforts,
  filterOpencodeDiscovered,
  opencodeTextModels,
  versionPresent,
} from "../src/adapters/types"
import { discover } from "../src/capabilities"

test("versionPresent gates on semver-ish stdout", () => {
  expect(versionPresent("claude 2.1.0")).toEqual([{ id: "__present__" }])
  expect(versionPresent("not-json")).toEqual([])
})

test("codexModels reads slugs and efforts from models_cache.json", async () => {
  const dir = (await Bun.$`mktemp -d /tmp/codex-models-XXXXXX`.text()).trim()
  await writeFile(
    join(dir, "models_cache.json"),
    JSON.stringify({
      models: [
        {
          slug: "gpt-5.6-sol",
          context_window: 272000,
          visibility: "list",
          default_reasoning_level: "low",
          supported_reasoning_levels: [
            { effort: "low" },
            { effort: "medium" },
            { effort: "high" },
            { effort: "ultra" },
          ],
        },
        { slug: "gpt-5.4", max_context_window: 1_000_000, context_window: 272000, visibility: "list" },
        { slug: "codex-auto-review", visibility: "hide", description: "Automatic approval review model for Codex." },
        { slug: "gpt-5.6-sol" },
        { slug: 1 },
      ],
    }),
  )
  const models = await codexModels(dir)
  expect(models.map((m) => m.id)).toEqual(["gpt-5.6-sol", "gpt-5.4"])
  expect(models[0]?.efforts).toEqual(["low", "medium", "high", "ultra"])
  expect(models[0]?.defaultEffort).toBe("low")
  expect(models[1]?.limits?.context).toBe(1_000_000)
})

test("claudeModels includes CLI effort levels", async () => {
  const dir = (await Bun.$`mktemp -d /tmp/claude-models-XXXXXX`.text()).trim()
  const claude = join(dir, ".claude")
  await mkdir(claude, { recursive: true })
  await writeFile(join(claude, "stats-cache.json"), JSON.stringify({ modelUsage: { "claude-opus-4-7": {}, "claude-sonnet-4-6": {} } }))
  await writeFile(join(claude, "settings.json"), JSON.stringify({ model: "opus[1m]" }))
  const models = await claudeModels(dir)
  const ids = models.map((m) => m.id)
  expect(ids).toContain("fable")
  expect(ids).toContain("opus")
  expect(ids).toContain("sonnet")
  expect(ids).toContain("haiku")
  expect(ids).toContain("claude-opus-4-7")
  expect(ids).toContain("claude-sonnet-4-6")
  expect(models[0]?.efforts).toEqual(["low", "medium", "high", "xhigh", "max"])
})

test("enrichOpencodeEfforts reads models.dev reasoning_options", async () => {
  const dir = (await Bun.$`mktemp -d /tmp/oc-efforts-XXXXXX`.text()).trim()
  const cache = join(dir, "models.json")
  await writeFile(cache, JSON.stringify({
    stepfun: {
      models: {
        "flash": { reasoning_options: [{ type: "effort", values: ["low", "high"] }] },
      },
    },
  }))
  const enriched = await enrichOpencodeEfforts([{ id: "stepfun/flash" }, { id: "other/x" }], cache)
  expect(enriched[0]?.efforts).toEqual(["low", "high"])
  expect(enriched[1]?.efforts).toBeUndefined()
})

test("filterOpencodeDiscovered drops herdr feedback-loop ids", () => {
  expect(filterOpencodeDiscovered([
    { id: "opencode/gpt-5" },
    { id: "herdr/cursor-abc" },
    { id: "openrouter/foo" },
  ]).map((m) => m.id)).toEqual(["opencode/gpt-5", "openrouter/foo"])
  // Raw text parse still sees herdr lines; discovery wraps with filterOpencodeDiscovered.
  expect(opencodeTextModels("opencode/gpt-5\nherdr/cursor-x\nopenrouter/foo\n").map((m) => m.id)).toEqual([
    "opencode/gpt-5",
    "herdr/cursor-x",
    "openrouter/foo",
  ])
  expect(filterOpencodeDiscovered(opencodeTextModels("opencode/gpt-5\nherdr/cursor-x\n")).map((m) => m.id)).toEqual([
    "opencode/gpt-5",
  ])
})

test("discover uses listModels catalog after version gate", async () => {
  const snapshot = await discover({
    run: async (argv) =>
      argv[0] === "herdr" || argv.includes("--version")
        ? { code: 0, stdout: "tool 1.2.3\n" }
        : { code: 0, stdout: '{"models":["agent"]}\n' },
    adapters: [
      {
        id: "codex",
        command: ["codex"],
        modelsArg: ["codex", "--version"],
        toolCall: true,
        limits: { context: 1, output: 1 },
        parseModels: versionPresent,
        listModels: async () => [{ id: "gpt-5.6-sol" }, { id: "gpt-5.6-terra" }],
        modelProvenance: "known",
      },
    ],
  })
  expect(snapshot.runtimes[0]?.provenance).toBe("known")
  expect(snapshot.targets.map((t) => t.nativeModel)).toEqual(["gpt-5.6-sol", "gpt-5.6-terra"])
  expect(snapshot.targets.every((t) => t.provenance === "known")).toBeTrue()
})
