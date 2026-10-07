import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { HerdrPlugin } from "../src/index.js"
import { publishSnapshot, type Snapshot } from "../src/capabilities.js"

export async function createV2Context(
  plugin: typeof HerdrPlugin,
  options: {
    syntheticError?: Error
    holdRefresh?: boolean
    reloadError?: Error
    sessionDirectories?: Record<string, string>
    routing?: { variant?: string | null }
  } = {},
) {
  const home = await mkdtemp(join(tmpdir(), "herdr-v2-"))
  const config = join(home, "config")
  const xdgConfig = join(config, "opencode")
  const state = join(home, "state")
  await mkdir(xdgConfig, { recursive: true })
  const target = {
    id: "herdr/cursor/agent",
    name: "cursor agent",
    adapter: "cursor",
    nativeModel: "agent",
    provenance: "verified" as const,
    limits: { context: 128_000, output: 16_384 },
    toolCall: true,
    efforts: ["low", "high"],
  }
  const snapshot: Snapshot = {
    schemaVersion: 1,
    createdAt: "2026-10-05T00:00:00.000Z",
    herdr: true,
    runtimes: [{ id: "cursor", provenance: "verified" }],
    targets: [target],
  }
  await publishSnapshot(join(state, "opencode-herdr"), snapshot)
  await writeFile(join(xdgConfig, "herdr-routing.json"), JSON.stringify({
    schemaVersion: 1,
    assignments: { build: { model: target.id, ...(options.routing ?? { variant: "high" }) } },
  }))

  const previousEnv = { HOME: process.env.HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, XDG_STATE_HOME: process.env.XDG_STATE_HOME }
  process.env.HOME = home
  process.env.XDG_CONFIG_HOME = config
  process.env.XDG_STATE_HOME = state

  const registrations = {
    providers: [] as unknown[],
    models: new Map<string, any>(),
    tools: [] as unknown[],
    commands: [] as unknown[],
    sdk: [] as Array<(event: any) => void>,
    language: [] as Array<(event: any) => void>,
    sessionHooks: [] as Array<{ name: string; callback: (event: any) => void | Promise<void> }>,
    agents: new Map<string, any>([["build", { model: { variant: "high" } }]]),
    synthetic: [] as unknown[],
    eventSubscriptions: [] as unknown[],
    catalogTransforms: [] as Array<(editor: any) => void>,
  }
  let releaseRefresh: () => void = () => {}
  let spawnCalls = 0
  const refreshGate = options.holdRefresh
    ? new Promise<void>((resolve) => { releaseRefresh = resolve })
    : undefined
  let reloadCalls = 0
  let emptyModelDiscovery = false
  const catalogEditor = () => ({
    provider: {
      update: (id: string, update: (provider: any) => void) => {
        const provider = registrations.providers[0] as any ?? { id, name: id, models: new Map() }
        update(provider)
        registrations.providers[0] = provider
      },
      list: () => registrations.providers.map((provider: any) => ({ provider, models: registrations.models })),
    },
    model: {
      update: (_providerID: string, modelID: string, update: (model: any) => void) => {
        const model = registrations.models.get(modelID) ?? {}
        update(model)
        registrations.models.set(modelID, model)
      },
      remove: (_providerID: string, modelID: string) => { registrations.models.delete(String(modelID)) },
    },
  })
  const context = {
    options: {},
    location: { directory: home },
    catalog: {
      async transform(callback: (editor: any) => void) {
        registrations.catalogTransforms.push(callback)
        callback(catalogEditor())
        return { dispose: async () => { registrations.catalogTransforms = registrations.catalogTransforms.filter((item) => item !== callback) } }
      },
      async reload() {
        reloadCalls += 1
        if (options.reloadError && reloadCalls > 1) throw options.reloadError
        for (const transform of registrations.catalogTransforms) transform(catalogEditor())
      },
    },
    aisdk: {
      hook: async (name: "sdk" | "language", callback: (event: any) => void) => {
        registrations[name].push(callback)
        return { dispose: async () => undefined }
      },
    },
    agent: {
      async transform(callback: (editor: any) => void) {
        callback({
          update: (id: string, update: (agent: any) => void) => {
            const agent = registrations.agents.get(id)
            if (agent) update(agent)
          },
        })
        return { dispose: async () => undefined }
      },
    },
    tool: {
      async transform(callback: (editor: any) => void) {
        callback({ add: (tool: unknown) => registrations.tools.push(tool) })
        return { dispose: async () => undefined }
      },
    },
    command: {
      async transform(callback: (editor: any) => void) {
        callback({ add: (command: unknown) => registrations.commands.push(command) })
        return { dispose: async () => undefined }
      },
    },
    session: {
      async hook(name: string, callback: (event: any) => void | Promise<void>) {
        registrations.sessionHooks.push({ name, callback })
        return { dispose: async () => undefined }
      },
      async get({ sessionID }: { sessionID: string }) {
        return { location: { directory: options.sessionDirectories?.[sessionID] ?? home } }
      },
      async synthetic(input: unknown) {
        if (options.syntheticError) throw options.syntheticError
        registrations.synthetic.push(input)
      },
    },
    event: {
      subscribe(options: unknown) {
        registrations.eventSubscriptions.push(options)
        return { async *[Symbol.asyncIterator]() {} }
      },
    },
  }

  const oldSpawn = Bun.spawn
  const restoreEnvironment = () => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  Bun.spawn = ((argv: string[]) => {
    spawnCalls += 1
    return {
    exited: refreshGate ? refreshGate.then(() => 0) : Promise.resolve(0),
    stdout: new Response(argv[0] === "herdr" ? "1.0.0\n" : JSON.stringify({ models: emptyModelDiscovery ? [] : ["agent"] })).body!,
    stderr: new Response("").body!,
    }
  }) as unknown as typeof Bun.spawn
  try {
    const unload = await plugin.setup(context as unknown as Parameters<typeof plugin.setup>[0])
    const unloadPlugin = async () => {
      if (typeof unload === "function") await unload()
    }
    let cleaned = false
    const restore = async () => {
      if (cleaned) return
      cleaned = true
      await unloadPlugin()
      Bun.spawn = oldSpawn
      restoreEnvironment()
      await rm(home, { recursive: true, force: true })
    }
    return {
      registrations,
      target,
      home,
      unload: unloadPlugin,
      releaseRefresh,
      get spawnCalls() { return spawnCalls },
      get reloadCalls() { return reloadCalls },
      setEmptyModelDiscovery: (empty: boolean) => { emptyModelDiscovery = empty },
      cleanup: restore,
    }
  } catch (error) {
    Bun.spawn = oldSpawn
    restoreEnvironment()
    await rm(home, { recursive: true, force: true })
    throw error
  }
}
