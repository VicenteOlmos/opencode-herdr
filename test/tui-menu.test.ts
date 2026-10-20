import { expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { HerdrTuiPlugin } from "../src/tui.js"
import { applyRoutingInPlace, readRouting } from "../src/routing.js"

async function withMenu(answers: Array<string | undefined>, check: (fixture: any) => Promise<void>, native = false) {
  const root = mkdtempSync(join(tmpdir(), "herdr-menu-")), directory = join(root, "opencode")
  mkdirSync(directory)
  const configPath = join(directory, "opencode.json"), routingPath = join(directory, "herdr-routing.json")
  writeFileSync(configPath, JSON.stringify({ [native ? "agents" : "agent"]: {
    explore: { model: "herdr/cursor/agent#high", prompt: "keep" }, other: { model: "openai/stable" },
  }, mcp: { keep: true } }))
  writeFileSync(routingPath, JSON.stringify({ schemaVersion: 1, assignments: {
    explore: { model: "herdr/cursor/agent", variant: "high" }, other: { model: "herdr/cursor/stable" },
  } }))
  const commands: any[] = [], dialogs: any[] = [], toasts: any[] = []
  const collection = (rows: any[]) => ({ sync: async () => {}, list: () => rows, invalidate() {} })
  const context = {
    options: {}, location: { directory: root },
    keymap: { layer: (factory: any) => commands.push(...factory().commands) },
    data: { on: () => () => {}, session: { get: () => undefined }, location: {
      provider: collection([{ id: "herdr", name: "Herdr" }, { id: "openai", name: "OpenAI" }]),
      agent: collection([{ id: "explore" }]),
      model: collection([
        { providerID: "herdr", modelID: "cursor/agent", name: "Cursor Agent", enabled: true, capabilities: { tools: true }, variants: [{ id: "high" }] },
        { providerID: "openai", modelID: "gpt", name: "GPT Model", enabled: true, capabilities: { tools: true } },
        { providerID: "hidden", modelID: "off", enabled: false, capabilities: { tools: true } },
        { providerID: "no-tools", modelID: "plain", enabled: true, capabilities: { tools: false } },
      ]),
    } },
    ui: {
      router: { current: () => ({ type: "home" }) }, slot: ({ render }: any) => { render({}); return () => {} },
      dialog: { select: async (input: any) => { dialogs.push(input); return answers.shift() } },
      toast: { show: (input: any) => toasts.push(input) },
    },
  }
  const before = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = root
  let cleanup: any
  try {
    cleanup = await HerdrTuiPlugin.setup(context as any)
    const menu = commands.find(command => command.slash?.name === "herdr-model")
    expect(menu).toBeDefined()
    await check({ root, directory, configPath, routingPath, dialogs, toasts, menu,
      hashes: () => [readFileSync(configPath, "utf8"), readFileSync(routingPath, "utf8")],
    })
  } finally {
    await cleanup?.()
    if (before === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = before
  }
}

test("all providers are offered; ordinary models preserve unrelated config and remove obsolete Herdr routing", async () => {
  for (const native of [false, true]) await withMenu(["explore", "openai", "gpt"], async f => {
    await f.menu.run()
    const config = JSON.parse(readFileSync(f.configPath, "utf8")), agents = config.agents ?? config.agent
    expect(agents.explore).toEqual({ model: "openai/gpt", prompt: "keep" })
    expect(agents.other.model).toBe("openai/stable")
    expect(config.mcp).toEqual({ keep: true })
    expect(JSON.parse(readFileSync(f.routingPath, "utf8")).assignments).toEqual({ other: { model: "herdr/cursor/stable" } })
    expect(f.dialogs[1].options.map((option: any) => option.value)).toEqual(expect.arrayContaining(["herdr", "openai"]))
    expect(f.dialogs[1].options.map((option: any) => option.value)).not.toContain("hidden")
    expect(f.dialogs[1].options.map((option: any) => option.value)).not.toContain("no-tools")
  }, native)
})

test("Herdr model and effort/default retain schema-1 durable assignments", async () => {
  for (const effort of ["high", ""]) await withMenu(["explore", "herdr", "cursor/agent", effort], async f => {
    await f.menu.run()
    expect(JSON.parse(readFileSync(f.configPath, "utf8")).agent.explore.model).toBe("herdr/cursor/agent" + (effort ? `#${effort}` : ""))
    expect(JSON.parse(readFileSync(f.routingPath, "utf8"))).toEqual({ schemaVersion: 1, assignments: {
      explore: { model: "herdr/cursor/agent", variant: effort }, other: { model: "herdr/cursor/stable" },
    } })
    const runtime: any = { agent: { explore: { prompt: "keep" } } }
    applyRoutingInPlace(runtime, readRouting(f.routingPath))
    expect(runtime.agent.explore).toEqual({ model: "herdr/cursor/agent", variant: effort, prompt: "keep" })
  })
})

test("canceling each selection never writes configuration or routing", async () => {
  for (const answers of [[], ["explore"], ["explore", "herdr"], ["explore", "herdr", "cursor/agent"]]) await withMenu(answers, async f => {
    const before = f.hashes()
    await f.menu.run()
    expect(f.hashes()).toEqual(before)
    expect(f.toasts).toEqual([])
  })
})

test("clearing Herdr preserves agent settings and other durable assignments", async () => {
  await withMenu(["explore", "__clear__"], async f => {
    await f.menu.run()
    expect(JSON.parse(readFileSync(f.configPath, "utf8")).agent.explore).toEqual({ prompt: "keep" })
    expect(JSON.parse(readFileSync(f.routingPath, "utf8")).assignments).toEqual({ other: { model: "herdr/cursor/stable" } })
  })
})

test("malformed configuration is rejected without writes", async () => {
  await withMenu([], async f => {
    writeFileSync(f.configPath, "{")
    const before = f.hashes()
    await f.menu.run()
    expect(f.hashes()).toEqual(before)
    expect(f.toasts.at(-1).variant).toBe("error")
  })
})

test("a routing write failure rolls configuration back byte-for-byte", async () => {
  await withMenu(["explore", "herdr", "cursor/agent", "high"], async f => {
    const before = readFileSync(f.configPath, "utf8")
    unlinkSync(f.routingPath)
    mkdirSync(f.routingPath)
    await f.menu.run()
    expect(readFileSync(f.configPath, "utf8")).toBe(before)
    expect(readdirSync(f.routingPath)).toEqual([])
    expect(readdirSync(f.directory).some(name => name.endsWith(".tmp"))).toBe(false)
    expect(f.toasts.at(-1).variant).toBe("error")
  })
})

test("menu search ignores spaces, hyphens and underscores", async () => {
  await withMenu(["explore", "openai"], async f => {
    await f.menu.run()
    const picker = f.dialogs[2]
    for (const query of ["gpt model", "GPT-model", "gpt_model"]) {
      expect(picker.search(query, picker.options).map((option: any) => option.value)).toEqual(["gpt"])
    }
  })
})
