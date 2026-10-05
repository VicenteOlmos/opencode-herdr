import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { HerdrPlugin } from "../src/index.js"
import { publishSnapshot, type Snapshot } from "../src/capabilities.js"

export async function createV2Context(
  plugin: typeof HerdrPlugin,
  options: { syntheticError?: Error; holdRefresh?: boolean; reloadError?: Error } = {},
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
    assignments: { build: { model: target.id, variant: "high" } },
  }))

  const previousEnv = { HOME: process.env.HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, XDG_STATE_HOME: process.env.XDG_STATE_HOME }
  process.env.HOME = home
  process.env.XDG_CONFIG_HOME = config
  process.env.XDG_STATE_HOME = state

  const registrations = {
    providers: [] as unknown[],
    tools: [] as unknown[],
    commands: [] as unknown[],
    sdk: [] as Array<(event: any) => void>,
    language: [] as Array<(event: any) => void>,
    agents: new Map<string, any>([["build", {}]]),
    synthetic: [] as unknown[],
    eventSubscriptions: [] as unknown[],
  }
  let releaseRefresh: () => void = () => {}
  let spawnCalls = 0
  const refreshGate = options.holdRefresh
    ? new Promise<void>((resolve) => { releaseRefresh = resolve })
    : undefined
  let reloadCalls = 0
  const context = {
    options: {},
    location: { directory: home },
    provider: {
      async transform(callback: (editor: any) => void) {
        callback({ add: (provider: unknown) => registrations.providers.push(provider) })
        return { dispose: async () => undefined }
      },
      async reload() {
        reloadCalls += 1
        if (options.reloadError) throw options.reloadError
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
    stdout: new Response(argv[0] === "herdr" ? "1.0.0\n" : JSON.stringify({ models: ["agent"] })).body!,
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
      cleanup: restore,
    }
  } catch (error) {
    Bun.spawn = oldSpawn
    restoreEnvironment()
    await rm(home, { recursive: true, force: true })
    throw error
  }
}
