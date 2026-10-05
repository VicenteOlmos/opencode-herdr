#!/usr/bin/env bun
import assert from "node:assert/strict"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const runtimeVersion = "0.0.0-beta-17823"
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const pluginEntrypoint = join(projectRoot, "src", "index.ts")
const root = await mkdtemp(join(tmpdir(), "opencode-herdr-v2-smoke-"))
const home = join(root, "home")
const configHome = join(home, ".config")
const stateHome = join(root, "state")
const cacheHome = join(root, "cache")
const fixture = join(root, "workspace")
const fakeBin = join(root, "fake-bin")
const fakeLog = join(root, "runner.log")
const runtime = join(root, "runtime")
const serverPassword = crypto.randomUUID()

async function capture(command: string, args: string[], cwd: string, env: Record<string, string>) {
  const child = Bun.spawn([command, ...args], { cwd, env, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} exited ${code}: ${(stderr || stdout).slice(-2_000)}`)
  return { stdout, stderr }
}

async function getJson(base: string, path: string, authorization: string, directory?: string) {
  const url = new URL(path, base)
  if (directory) url.searchParams.set("location[directory]", directory)
  const response = await runtimeFetch(url, { headers: { authorization } })
  const text = await response.text()
  if (!response.ok) throw new Error(`GET ${url.pathname} returned ${response.status}: ${text.slice(0, 500)}`)
  return JSON.parse(text) as unknown
}

function runtimeFetch(input: string | URL, init: RequestInit = {}) {
  return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(2_000) })
}

function assertLocation(value: any, directory: string, route: string) {
  assert.equal(value?.location?.directory, directory, `${route} returned a different location: ${JSON.stringify(value?.location)}`)
}

function configuredPlugin(config: any, entrypoint: string) {
  const documents = Array.isArray(config) ? config : Array.isArray(config?.data) ? config.data : []
  return documents.some((document: any) => {
    const plugins = document?.info?.plugins ?? document?.plugins
    return Array.isArray(plugins) && plugins.some((plugin: any) =>
      plugin?.package === entrypoint && JSON.stringify(plugin?.options ?? {}) === "{}",
    )
  })
}

try {
  await Promise.all([home, join(configHome, "opencode"), stateHome, join(cacheHome, "opencode"), fixture, fakeBin].map((path) => mkdir(path, { recursive: true })))
  const env = {
    HOME: home,
    PATH: `${fakeBin}:/usr/local/bin:/usr/bin:/bin`,
    TMPDIR: root,
    XDG_CONFIG_HOME: configHome,
    XDG_STATE_HOME: stateHome,
    XDG_CACHE_HOME: cacheHome,
    NPM_CONFIG_CACHE: join(root, "npm-cache"),
    NPM_CONFIG_USERCONFIG: join(home, "npmrc"),
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
    HERDR_FAKE_LOG: fakeLog,
    HERDR_WORKSPACE_ID: "v2-smoke-workspace",
    HERDR_TAB_ID: "v2-smoke-tab",
    HERDR_PANE_ID: "v2-smoke-pane",
    NO_COLOR: "1",
    OPENCODE_SERVER_USERNAME: "opencode",
    OPENCODE_SERVER_PASSWORD: serverPassword,
    HTTP_PROXY: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
    ALL_PROXY: "http://127.0.0.1:9",
    NO_PROXY: "127.0.0.1,localhost",
  }
  // Registry setup runs outside the runtime's loopback-only network sandbox. Keep
  // the install environment isolated and credential-free instead of inheriting it.
  const installEnv = {
    HOME: home,
    PATH: "/usr/local/bin:/usr/bin:/bin",
    TMPDIR: root,
    XDG_CONFIG_HOME: configHome,
    XDG_STATE_HOME: stateHome,
    XDG_CACHE_HOME: cacheHome,
    NPM_CONFIG_CACHE: join(root, "npm-cache"),
    NPM_CONFIG_USERCONFIG: join(home, "npmrc"),
    NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
    CI: "1",
  }
  await writeFile(env.NPM_CONFIG_USERCONFIG, "")
  await writeFile(join(cacheHome, "opencode", "models.json"), "{}")
    .catch(async () => { await mkdir(join(cacheHome, "opencode"), { recursive: true }); await writeFile(join(cacheHome, "opencode", "models.json"), "{}") })

  const fakeScript = `#!/bin/sh
printf '%s:%s\\n' "$(basename "$0")" "$*" >> "$HERDR_FAKE_LOG"
case "$(basename "$0"):$1" in
  herdr:--version) echo 'herdr 0.1.0' ;;
  agent:models) echo 'agent - Fake Agent' ;;
  opencode:models) echo '{"models":["fake/model"]}' ;;
  claude:--version) echo 'Claude Code 1.0.0' ;;
  codex:--version) echo 'codex 1.0.0' ;;
  *) echo "unexpected fake runner call: $*" >&2; exit 64 ;;
esac
`
  for (const name of ["herdr", "agent", "opencode", "claude", "codex"]) {
    const path = join(fakeBin, name)
    await writeFile(path, fakeScript)
    await chmod(path, 0o755)
  }
  await writeFile(join(configHome, "opencode", "opencode.json"), JSON.stringify({
    plugins: [{ package: pluginEntrypoint, options: {} }],
  }))

  let cli = process.env.OPENCODE_V2_BIN
  if (!cli) {
    await capture("npm", [
      "install", "--no-save", "--package-lock=false", "--ignore-scripts", "--no-audit", "--no-fund",
      "--prefix", runtime, `@opencode-ai/cli@${runtimeVersion}`,
    ], root, installEnv)
    const packageRoot = join(runtime, "node_modules", "@opencode-ai", "cli")
    await capture("node", [join(packageRoot, "postinstall.mjs")], root, installEnv)
    cli = join(runtime, "node_modules", ".bin", "opencode2")
  }

  const version = await capture(cli, ["--version"], fixture, env)
  assert.match(version.stdout, new RegExp(`opencode2 v${runtimeVersion.replaceAll(".", "\\.")}`))

  const portCheck = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
  const port = portCheck.port
  portCheck.stop(true)
  const server = Bun.spawn([cli, "serve", "--hostname", "127.0.0.1", "--port", String(port), "--log-level", "debug"], {
    cwd: fixture,
    env,
    stdout: "pipe",
    stderr: "pipe",
  })
  let logs = ""
  const logReaders: ReadableStreamDefaultReader<Uint8Array>[] = []
  const readLogs = async (stream: ReadableStream<Uint8Array> | null) => {
    if (!stream) return
    const reader = stream.getReader()
    logReaders.push(reader)
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        logs += new TextDecoder().decode(value)
      }
    } finally {
      reader.releaseLock()
    }
  }
  const logReads = Promise.all([readLogs(server.stdout), readLogs(server.stderr)])
  const base = `http://127.0.0.1:${port}`
  const apiBase = base
  const authorization = `Basic ${btoa(`opencode:${serverPassword}`)}`
  let ready = false
  try {
    const serverReadyDeadline = Date.now() + 20_000
    while (Date.now() < serverReadyDeadline) {
      if (server.exitCode !== null) break
      try {
        const response = await runtimeFetch(`${base}/api/health`, { headers: { authorization } })
        if (response.ok) { ready = true; break }
      } catch {}
      await Bun.sleep(250)
    }
    if (!ready) {
      const probes = await Promise.all(["/api/health", "/api/plugin"].map(async (path) => {
        const response = await runtimeFetch(`${base}${path}`, { headers: { authorization } })
        return `${path}=${response.status}`
      }))
      throw new Error(`OpenCode server route probe failed (${probes.join(", ")}): ${logs.replaceAll(serverPassword, "[redacted]").slice(0, 1_200)}`)
    }

    const created = await runtimeFetch(`${apiBase}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify({ location: { directory: fixture } }),
    })
    const createdBody = await created.json() as any
    assert.equal(created.ok, true, JSON.stringify(createdBody))
    assert.equal(createdBody.data?.location?.directory, fixture, `session created outside fixture: ${JSON.stringify(createdBody.data?.location)}`)

    const config = await getJson(apiBase, "/api/config", authorization, fixture) as any
    assert.ok(configuredPlugin(config, pluginEntrypoint),
      "runtime config did not expose the exact local plugin entry and empty options")

    const pluginDeadline = Date.now() + 45_000
    let plugin: any
    let activePlugin: any
    let failedPlugin: any
    while (Date.now() < pluginDeadline && server.exitCode === null) {
      plugin = await getJson(apiBase, "/api/plugin", authorization, fixture)
      assertLocation(plugin, fixture, "/api/plugin")
      const entries = Array.isArray(plugin?.data) ? plugin.data : []
      activePlugin = entries.find((entry: any) => entry?.id === "opencode-herdr" && entry?.status === "active"
        && entry?.source?.type === "local" && entry?.source?.path === pluginEntrypoint)
      failedPlugin = entries.find((entry: any) => entry?.status === "failed"
        && entry?.source?.type === "local"
        && entry?.source?.path === pluginEntrypoint)
      if (activePlugin || failedPlugin) break
      await Bun.sleep(100)
    }
    const safeError = failedPlugin?.error
      ? String(failedPlugin.error).replaceAll(pluginEntrypoint, "[plugin entrypoint]").replaceAll(projectRoot, "[plugin root]").replaceAll(fixture, "[workspace]").replaceAll(serverPassword, "[redacted]")
      : undefined
    assert.ok(!failedPlugin, `OpenCode ${runtimeVersion} reported the configured plugin as failed: ${safeError ?? "no error detail"}`)
    assert.ok(activePlugin,
      `timed out waiting for exact beta plugin id opencode-herdr to become active (45s); plugin data=${JSON.stringify(plugin?.data ?? []).replaceAll(pluginEntrypoint, "[plugin entrypoint]").replaceAll(fixture, "[workspace]")}; logs=${logs.replaceAll(serverPassword, "[redacted]").slice(-2_000)}`)

    const providers = await getJson(apiBase, "/api/provider", authorization, fixture) as any
    const models = await getJson(apiBase, "/api/model", authorization, fixture) as any
    assertLocation(providers, fixture, "/api/provider")
    assertLocation(models, fixture, "/api/model")
    const herdrProvider = (providers.data ?? []).find((provider: any) => provider?.id === "herdr" && provider?.name === "Herdr")
    assert.ok(herdrProvider, "native provider catalog did not contain the Herdr provider identity")
    const herdrModel = (models.data ?? []).find((model: any) => model?.providerID === "herdr" && model?.modelID === "cursor/agent")
    assert.ok(herdrModel, "native model catalog did not contain Herdr cursor/agent")
    assert.doesNotMatch(await readFile(fakeLog, "utf8"), /opencode:run/)
    console.log(`PASS OpenCode ${runtimeVersion}: active plugin and Herdr provider/model catalog for the requested location`)
    console.log("PASS no model generation ran; local TUI command behavior is outside this server smoke")
  } finally {
    server.kill("SIGTERM")
    const exited = await Promise.race([server.exited.then(() => true), Bun.sleep(5_000).then(() => false)])
    if (!exited) {
      server.kill("SIGKILL")
      const killed = await Promise.race([server.exited.then(() => true), Bun.sleep(2_000).then(() => false)])
      if (!killed) throw new Error("OpenCode beta smoke server did not exit after SIGKILL")
    }
    const logsClosed = await Promise.race([logReads.then(() => true), Bun.sleep(1_000).then(() => false)])
    if (!logsClosed) {
      await Promise.all(logReaders.map((reader) => reader.cancel().catch(() => undefined)))
      await Promise.race([logReads, Bun.sleep(500)])
    }
  }
} finally {
  await rm(root, { recursive: true, force: true })
}
