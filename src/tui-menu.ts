import type { Plugin } from "@opencode-ai/plugin/tui"
import { chmodSync, copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { readRouting, setAssignment, writeRouting } from "./routing.js"

type Context = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0]
type CatalogModel = NonNullable<ReturnType<Context["data"]["location"]["model"]["list"]>>[number]
type MenuOption = { title: string; value: string; description?: string; category?: string }
type MenuSelect = { title: string; current?: string; options: MenuOption[]; search?: (query: string, options: MenuOption[]) => MenuOption[] }

function atomicWrite(path: string, text: string) {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  try {
    writeFileSync(temporary, text, { mode: 0o600 })
    renameSync(temporary, path)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

function persistModel(configPath: string, routingPath: string, agent: string, model: CatalogModel | null, variant = "") {
  const before = readFileSync(configPath, "utf8"), config = JSON.parse(before)
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Global OpenCode configuration must be an object")
  const key = config.agents ? "agents" : config.agent ? "agent" : "agents"
  const current = config[key]?.[agent] ?? {}
  const { variant: _oldVariant, ...preserved } = current
  const fullId = model ? `${model.providerID}/${model.modelID}` : undefined
  let entry = current
  if (fullId) entry = { ...preserved, model: fullId + (variant ? `#${variant}` : "") }
  else if (typeof current.model === "string" && current.model.startsWith("herdr/")) {
    const { model: _oldModel, ...remaining } = preserved
    entry = remaining
  }
  config[key] = { ...config[key], [agent]: entry }
  const routing = readRouting(routingPath)
  const nextRouting = setAssignment(routing, agent, model?.providerID === "herdr" ? { model: fullId!, variant } : null)
  copyFileSync(configPath, `${configPath}.herdr-menu.bak`)
  chmodSync(`${configPath}.herdr-menu.bak`, 0o600)
  atomicWrite(configPath, `${JSON.stringify(config, null, 2)}\n`)
  try {
    if (JSON.stringify(routing) !== JSON.stringify(nextRouting)) writeRouting(nextRouting, routingPath)
  } catch (error) {
    atomicWrite(configPath, before)
    throw error
  }
}

async function openMenu(context: Context) {
  const directory = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode")
  const configPath = join(directory, "opencode.json"), routingPath = join(directory, "herdr-routing.json")
  const location = context.location ?? context.data.location.default(), catalog = context.data.location
  await Promise.all([catalog.provider.sync(location), catalog.model.sync(location), catalog.agent.sync(location)])
  const models = (catalog.model.list(location) ?? []).filter(model => model.enabled !== false && model.capabilities.tools)
  const providerNames = new Map((catalog.provider.list(location) ?? []).map(provider => [String(provider.id), provider.name]))
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  const search = (query: string, options: MenuOption[]) => options.filter(row => {
    const haystack = normalize([row.title, row.value, row.description].filter(Boolean).join(" "))
    return normalize(query).split(" ").every(token => haystack.includes(token))
  })
  // Newer V2 clients honor custom search; the pinned beta uses its native filter.
  const select = (options: MenuSelect) => context.ui.dialog.select(options)
  let assignedOnly = false, focus: string | undefined
  for (;;) {
    const config = JSON.parse(readFileSync(configPath, "utf8")), configured = { ...config.agent, ...config.agents }
    const routing = readRouting(routingPath)
    const names = [...new Set([...Object.keys(configured), ...(catalog.agent.list(location) ?? []).map(agent => String(agent.id))])].sort()
    const current = (name: string) => routing.assignments[name]?.model ?? configured[name]?.model ?? "(provider default)"
    const agent = await select({
      title: "Configure global agent models", current: focus, search,
      options: [
        { title: assignedOnly ? "Show all agents" : "Show Herdr-assigned agents", value: "__filter__", category: "Actions" },
        ...names.filter(name => !assignedOnly || String(current(name)).startsWith("herdr/")).map(name => ({ title: name, value: name, description: typeof current(name) === "string" ? current(name) : JSON.stringify(current(name)), category: "Agents" })),
      ],
    })
    if (agent === undefined) return
    if (agent === "__filter__") { assignedOnly = !assignedOnly; continue }
    focus = agent
    const providerIDs = [...new Set(models.map(model => String(model.providerID)))].sort((a, b) => a === "herdr" ? -1 : b === "herdr" ? 1 : a.localeCompare(b))
    const provider = await select({
      title: `Provider → ${agent}`, search,
      options: [
        ...(String(current(agent)).startsWith("herdr/") ? [{ title: "Clear Herdr assignment", value: "__clear__", category: "Actions" }] : []),
        ...providerIDs.map(id => ({ title: providerNames.get(id) ?? id, value: id, description: `${models.filter(model => model.providerID === id).length} models`, category: "Providers" })),
        { title: "← Back", value: "__back__", category: "Actions" },
      ],
    })
    if (provider === undefined) return
    if (provider === "__back__") continue
    if (provider === "__clear__") {
      persistModel(configPath, routingPath, agent, null)
    } else {
      const available = models.filter(model => model.providerID === provider)
      const selected = await select({
        title: `Model · ${providerNames.get(provider) ?? provider} → ${agent}`, search,
        options: [...available.map(model => ({ title: model.name, value: String(model.modelID), description: String(model.modelID), category: provider === "herdr" ? String(model.modelID).split("/")[0] : provider })), { title: "← Back", value: "__back__", category: "Actions" }],
      })
      if (selected === undefined) return
      if (selected === "__back__") continue
      const model = available.find(model => model.modelID === selected)
      if (!model) throw new Error("Selected model is no longer available")
      let variant = ""
      const variants = model.variants ?? []
      if (variants.length) {
        const picked = await select({ title: `Effort / variant · ${model.name}`, options: [
          { title: "Provider default", value: "", description: "Use the model default" },
          ...variants.map(option => ({ title: String(option.id), value: String(option.id) })),
        ] })
        if (picked === undefined) return
        if (picked !== "" && !variants.some(option => option.id === picked)) throw new Error("Selected variant is no longer available")
        variant = picked
      }
      persistModel(configPath, routingPath, agent, model, variant)
    }
    catalog.agent.invalidate(location)
    await catalog.agent.sync(location)
    context.ui.toast.show({ title: provider === "__clear__" ? "Herdr assignment cleared" : "Model saved", message: agent, variant: "success" })
  }
}

export function registerModelMenu(context: Context) {
  let opening = false
  return context.ui.slot({ append: "app", render: () => {
    context.keymap.layer(() => ({ mode: "global", commands: [{
      id: "opencode-herdr.models", title: "Configure agent models · Herdr and providers", group: "Herdr", palette: true,
      slash: { name: "herdr-model", aliases: ["herdr-routing"] }, bind: "alt+h",
      async run() {
        if (opening) return
        opening = true
        try { await openMenu(context) } catch (error) {
          context.ui.toast.show({ title: "Model configuration failed", message: error instanceof Error ? error.message : String(error), variant: "error" })
        } finally { opening = false }
      },
    }] }))
    return null
  } })
}
