import { mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { adapterFor, availableRuntimes, herdrKindLaunch, interactiveArgv } from "./adapters/types.js"
import { HerdrError } from "./errors.js"
import { HerdrAgent, type Run } from "./herdr.js"
import { HerdrPool } from "./pool.js"

export type HandoverArtifactV1 = {
  schema: "opencode-herdr.handover/v1"
  createdAt: string
  source: {
    agent: "opencode"
    sessionId: string
    directory: string
    workspaceId: string
    tabId: string
    paneId?: string
  }
  destination: { adapter: string; argv: string[]; kind: string; tabId: string }
  paths: { handover: string; export?: string }
  prompt: string
  warnings?: string[]
}

export type HandoverInput = {
  sessionId: string
  directory: string
  workspace: string
  tab: string
  pane?: string
  runtime?: string
  defaultRuntime?: string
  note?: string
  stateDir: string
  run?: Run
}

export type HandoverResult = {
  handoverPath: string
  exportPath?: string
  paneId: string
  terminalId: string
  runtime: string
  argv: string[]
  prompt: string
}

export function resolveRuntime(runtime: string | undefined, defaultRuntime: string | undefined, runtimes = availableRuntimes()) {
  const selected = (runtime ?? defaultRuntime ?? "").trim()
  if (!selected) throw new HerdrError(`runtime is required; available: ${runtimes.join(", ") || "none"}`)
  if (!adapterFor(selected)) throw new HerdrError(`unknown runtime: ${selected}; available: ${runtimes.join(", ") || "none"}`)
  if (!runtimes.includes(selected)) throw new HerdrError(`runtime unavailable: ${selected}; available: ${runtimes.join(", ") || "none"}`)
  return selected
}

/** First token is runtime when it matches a known adapter; otherwise whole text is a note for the default runtime. */
export function parseHandoverArgs(argumentsText: string) {
  const tokens = argumentsText.trim().split(/\s+/).filter(Boolean)
  const first = tokens[0]
  if (first && adapterFor(first)) {
    return { runtime: first, note: tokens.slice(1).join(" ").trim() }
  }
  return { runtime: undefined, note: argumentsText.trim() }
}

export function buildHandoverPrompt(input: {
  sessionId: string
  directory: string
  handoverPath: string
  exportPath?: string
  note?: string
}) {
  // Single line: herdr agent send writes literal text; newlines act as Enter in TUIs (esp. OpenCode).
  const parts = [
    "Continue from an OpenCode handover.",
    `Session ${input.sessionId}.`,
    `Directory ${input.directory}.`,
    `Artifact ${input.handoverPath}.`,
    input.exportPath ? `Export ${input.exportPath}.` : "Export unavailable.",
    "Read the artifact" + (input.exportPath ? " and export" : "") + ", then continue.",
  ]
  const note = input.note?.trim()
  if (note) parts.push(`Note: ${note.replace(/\s+/g, " ")}`)
  return parts.join(" ")
}

async function writeArtifact(path: string, artifact: HandoverArtifactV1) {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 })
  const tmp = `${path}.${crypto.randomUUID()}.tmp`
  await writeFile(tmp, JSON.stringify(artifact, null, 2), { mode: 0o600 })
  await rename(tmp, path)
}

async function exportSession(sessionId: string, exportPath: string, run: Run) {
  const result = await run(["opencode", "export", sessionId])
  if (result.code !== 0) return undefined
  const tmp = `${exportPath}.${crypto.randomUUID()}.tmp`
  await writeFile(tmp, result.stdout, { mode: 0o600 })
  await rename(tmp, exportPath)
  return exportPath
}

const idOk = (value: string) => /^[a-zA-Z0-9._:-]+$/.test(value)

export async function createHandover(input: HandoverInput): Promise<HandoverResult> {
  const run = input.run ?? (async (argv) => {
    const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: process.env })
    return { code: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() }
  })
  if (!input.sessionId.trim()) throw new HerdrError("sessionId is required")
  if (!input.directory.startsWith("/")) throw new HerdrError("directory must be an absolute path")
  if (!idOk(input.workspace) || !idOk(input.tab) || (input.pane && !idOk(input.pane))) throw new HerdrError("invalid Herdr workspace/tab/pane id")
  const runtime = resolveRuntime(input.runtime, input.defaultRuntime)
  const launch = herdrKindLaunch(runtime, input.directory)
  const argv = interactiveArgv(runtime, input.directory)
  const id = crypto.randomUUID()
  const handoverDir = join(input.stateDir, "handovers")
  const handoverPath = join(handoverDir, `${id}.json`)
  const exportPath = join(handoverDir, `${id}.export.json`)
  const warnings: string[] = []
  const exported = await exportSession(input.sessionId, exportPath, run).catch(() => undefined)
  if (!exported) warnings.push("opencode export unavailable")
  const prompt = buildHandoverPrompt({
    sessionId: input.sessionId,
    directory: input.directory,
    handoverPath,
    exportPath: exported,
    note: input.note,
  })
  if (/[\n\r\0]/.test(handoverPath)) throw new HerdrError("unsafe handover path")
  if (/[\n\r\0]/.test(prompt)) throw new HerdrError("handover prompt must be a single line (no Enter)")
  const pool = new HerdrPool({ run })
  const agent = new HerdrAgent(run)
  const slot = await pool.acquire({
    jobId: id,
    workspaceId: input.workspace,
    cwd: input.directory,
    env: { OPENCODE_HERDR_HANDOVER: handoverPath },
  })
  let owned
  try {
    owned = await agent.startKind({
      name: `handover-${id}`,
      kind: launch.kind,
      paneId: slot.paneId,
      args: launch.args,
    })
  } catch (error) {
    await pool.release(id, { status: "error" })
    throw error
  }
  const artifact: HandoverArtifactV1 = {
    schema: "opencode-herdr.handover/v1",
    createdAt: new Date().toISOString(),
    source: {
      agent: "opencode",
      sessionId: input.sessionId,
      directory: input.directory,
      workspaceId: input.workspace,
      tabId: input.tab,
      ...(input.pane ? { paneId: input.pane } : {}),
    },
    destination: { adapter: runtime, argv, kind: launch.kind, tabId: slot.tabId },
    paths: { handover: handoverPath, ...(exported ? { export: exported } : {}) },
    prompt,
    ...(warnings.length ? { warnings } : {}),
  }
  try {
    await writeArtifact(handoverPath, artifact)
    await agent.wait(owned, ["idle"])
    await agent.send(owned, prompt)
  } catch (error) {
    await agent.close(owned).catch(() => undefined)
    await pool.release(id, { status: "error", closePane: false }).catch(() => undefined)
    throw error
  }
  // Keep pane open for the user; drop registry entry without closing.
  await pool.release(id, { closePane: false, status: "done" })
  return { handoverPath, exportPath: exported, paneId: owned.paneId, terminalId: owned.terminalId, runtime, argv, prompt }
}

export function formatHandoverConfirmation(result: HandoverResult) {
  const lines = [
    `Herdr handover created for runtime ${result.runtime}.`,
    `session artifact: ${result.handoverPath}`,
    `pane: ${result.paneId}`,
    `terminal: ${result.terminalId}`,
    `destination argv: ${result.argv.join(" ")}`,
  ]
  if (result.exportPath) lines.push(`export: ${result.exportPath}`)
  lines.push("Context prompt was sent to the destination runtime after it reached idle.")
  return lines.join("\n")
}
