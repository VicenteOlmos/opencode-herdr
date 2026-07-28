import { herdrKindLaunch } from "./adapters/types.js"
import type { Target } from "./adapters/types.js"
import type { Snapshot } from "./capabilities.js"
import { asRecord, parseCliJson, type Run } from "./cli.js"
import { HandoverAbort } from "./errors.js"
import { HerdrAgent } from "./herdr.js"
import { HerdrPool } from "./pool.js"
import type { RuntimeContext } from "./opencode-config.js"

export type ToastFn = (input: {
  title: string
  message: string
  variant: "info" | "success" | "warning" | "error"
  duration?: number
}) => Promise<void>

/** Post a visible no-reply message into the OpenCode session transcript. */
export type PostSessionMessage = (markdown: string) => Promise<void>

export type SlashDeps = {
  snapshot: () => Snapshot
  refresh: () => Promise<Snapshot>
  runtimeCtx: () => RuntimeContext
  run: Run
  pool: () => HerdrPool
  directory: string
  /** Preferred runtime for `/herdr-test` agent probe (handoverDefault). */
  defaultRuntime?: string
  /** When true, leave the probe pane open after `/herdr-test`. */
  keepPanes?: boolean
  /** When set, mechanical results are written into the conversation. */
  postSession?: PostSessionMessage
}

export async function finishSlash(
  output: { parts: unknown[] },
  toast: ToastFn,
  input: {
    title: string
    message: string
    variant: "info" | "success" | "warning" | "error"
    summary: string
    /** Also show this markdown in the session transcript (no LLM reply). */
    postSession?: PostSessionMessage
    conversation?: boolean
  },
) {
  output.parts.splice(0, output.parts.length)
  let postError: string | undefined
  if (input.conversation !== false && input.postSession) {
    const md = `## ${input.title}\n\n${input.message}`
    try {
      await input.postSession(md)
    } catch (error) {
      postError = error instanceof Error ? error.message : "session post failed"
    }
  }
  const toastMessage = postError
    ? `${input.message}\n\n(conversation post failed: ${postError})`
    : input.message
  await toast({ title: input.title, message: toastMessage, variant: input.variant, duration: 8_000 })
  throw new HandoverAbort(input.summary)
}

function runtimeSummary(snapshot: Snapshot) {
  const verified = snapshot.runtimes.filter((r) => r.provenance === "verified").map((r) => r.id)
  const unknown = snapshot.runtimes.filter((r) => r.provenance !== "verified").map((r) => r.id)
  const parts = [`Herdr ${snapshot.herdr ? "ready" : "unavailable"}`]
  if (snapshot.diagnostic) parts.push(snapshot.diagnostic)
  parts.push(`${snapshot.targets.length} target${snapshot.targets.length === 1 ? "" : "s"}`)
  if (verified.length) parts.push(`verified: ${verified.join(", ")}`)
  if (unknown.length) parts.push(`unavailable: ${unknown.join(", ")}`)
  return parts.join(" · ")
}

function probeOk(summary: string): boolean {
  return summary.startsWith("ok") || summary.startsWith("skipped:")
}

/** Pick an interactive runtime for the agent sum probe. */
export function resolveTestRuntime(snapshot: Snapshot, defaultRuntime?: string): string {
  const verified = new Set(
    snapshot.runtimes.filter((r) => r.provenance === "verified").map((r) => r.id),
  )
  const preferred = [defaultRuntime, "cursor", "opencode", "claude", "codex"]
    .map((id) => id?.trim())
    .filter((id): id is string => Boolean(id))
  for (const id of preferred) {
    if (verified.has(id)) return id
  }
  const first = [...verified][0]
  if (first) return first
  throw new Error("no verified runtime for agent probe")
}

export function randomSumOperands(max = 40): { a: number; b: number; sum: number } {
  const a = 1 + Math.floor(Math.random() * max)
  const b = 1 + Math.floor(Math.random() * max)
  return { a, b, sum: a + b }
}

export function probeMarker(sum: number) {
  return `HERDR_PROBE_${sum}`
}

export function buildAgentSumPrompt(a: number, b: number) {
  // Single line: agent prompt / pane send treat newlines as Enter.
  // Do not embed HERDR_PROBE_<sum> — wait-output would match the prompt text itself.
  return `Compute ${a}+${b}. Reply with exactly one line containing only HERDR_PROBE_ followed immediately by the numeric sum, and nothing else.`
}

export type AgentProbeResult = {
  summary: string
  runtime: string
  paneId: string
  terminalId: string
  a: number
  b: number
  sum: number
  marker: string
  prompt: string
  matched: string
  snippet: string
  steps: string[]
}

/**
 * Create a pool pane, start an interactive agent, ask a random sum, wait, and read
 * the answer back into this OpenCode session (proves cross-pane read).
 */
export async function probeAgentRoundtrip(input: {
  run: Run
  pool: HerdrPool
  workspace: string
  cwd: string
  runtime: string
  a?: number
  b?: number
  startTimeoutMs?: number
  answerTimeoutMs?: number
  keepPanes?: boolean
}): Promise<AgentProbeResult> {
  const { a, b, sum } = input.a != null && input.b != null
    ? { a: input.a, b: input.b, sum: input.a + input.b }
    : randomSumOperands()
  const marker = probeMarker(sum)
  const prompt = buildAgentSumPrompt(a, b)
  const launch = herdrKindLaunch(input.runtime, input.cwd)
  const jobId = crypto.randomUUID()
  const agent = new HerdrAgent(input.run)
  const steps: string[] = []
  const record = await input.pool.acquire({
    jobId,
    workspaceId: input.workspace,
    cwd: input.cwd,
  })
  steps.push(`1. Created pane \`${record.paneId}\` (job pool)`)
  let owned: { terminalId: string; paneId: string } | undefined
  try {
    owned = await agent.startKind({
      name: `probe-${jobId.slice(0, 8)}`,
      kind: launch.kind,
      paneId: record.paneId,
      args: launch.args,
      timeoutMs: input.startTimeoutMs ?? 90_000,
    })
    steps.push(`2. Started **${input.runtime}** agent in \`${owned.paneId}\``)
    // Prefer pane id as wait target (terminal_id often 404s). idle|done both mean ready.
    await agent.wait(owned, ["idle", "done"], input.startTimeoutMs ?? 90_000)
    steps.push("3. Agent reached `idle`/`done`")
    steps.push(`4. Asked: \`${a}+${b}\` → expect \`${marker}\``)
    // Cursor (and some TUIs): agent prompt / pane run fill the input but need an Enter to submit.
    const prompted = await input.run(["herdr", "agent", "prompt", owned.paneId, prompt])
    if (prompted.code !== 0) {
      const ran = await input.run(["herdr", "pane", "run", owned.paneId, prompt])
      if (ran.code !== 0) throw new Error(prompted.stderr?.trim() || "agent prompt failed")
    } else {
      await input.run(["herdr", "pane", "send-keys", owned.paneId, "enter"]).catch(() => undefined)
    }
    const waited = await input.run([
      "herdr", "pane", "wait-output", owned.paneId,
      "--match", marker,
      "--source", "recent-unwrapped",
      "--timeout", String(input.answerTimeoutMs ?? 180_000),
    ])
    if (waited.code !== 0) throw new Error(waited.stderr?.trim() || `wait-output timed out for ${marker}`)
    steps.push("5. Waited until pane output contained the probe marker")
    const waitBody = asRecord(parseCliJson(waited.stdout))
    const matchedLine = typeof waitBody?.matched_line === "string" ? waitBody.matched_line : ""
    const waitRead = asRecord(waitBody?.read)
    let text = typeof waitRead?.text === "string" ? waitRead.text : ""
    if (!text.includes(marker)) {
      const read = await input.run([
        "herdr", "agent", "read", owned.paneId,
        "--source", "recent-unwrapped",
        "--lines", "40",
      ])
      if (read.code !== 0) throw new Error(read.stderr?.trim() || "agent read failed")
      const body = asRecord(parseCliJson(read.stdout))
      text = typeof body?.text === "string"
        ? body.text
        : typeof body?.output === "string"
          ? body.output
          : read.stdout
    }
    if (!text.includes(marker) && matchedLine !== marker) {
      throw new Error(`agent reply missing ${marker}`)
    }
    steps.push(`6. This OpenCode session read pane output and found \`${marker}\``)
    const snippet = text.trim().split("\n").slice(-12).join("\n")
    return {
      summary: `ok · ${input.runtime} · ${a}+${b}=${sum} · pane ${owned.paneId}`,
      runtime: input.runtime,
      paneId: owned.paneId,
      terminalId: owned.terminalId,
      a,
      b,
      sum,
      marker,
      prompt,
      matched: matchedLine || marker,
      snippet: snippet || matchedLine || marker,
      steps,
    }
  } finally {
    await input.pool.release(jobId, { closePane: !input.keepPanes, status: "done" }).catch(() => undefined)
  }
}

/** @deprecated Prefer probeAgentRoundtrip — kept for low-level I/O unit tests. */
export const PROBE_A = 2
export const PROBE_B = 3
export const PROBE_SUM = PROBE_A + PROBE_B
export const PROBE_MARKER = probeMarker(PROBE_SUM)

export type PaneProbeResult = {
  summary: string
  matched: string
  snippet: string
}

/** Shell-only write→wait→read (no agent). Used by unit tests. */
export async function probePaneRoundtrip(run: Run, paneId: string): Promise<PaneProbeResult> {
  const shell = `printf 'HERDR_PROBE_%s\\n' "$((${PROBE_A}+${PROBE_B}))"`
  const ran = await run(["herdr", "pane", "run", paneId, shell])
  if (ran.code !== 0) throw new Error(ran.stderr?.trim() || "pane run failed")
  const waited = await run([
    "herdr", "pane", "wait-output", paneId,
    "--match", PROBE_MARKER,
    "--source", "recent-unwrapped",
    "--timeout", "15000",
  ])
  if (waited.code !== 0) throw new Error(waited.stderr?.trim() || "wait-output timed out (sum probe)")
  const body = asRecord(parseCliJson(waited.stdout))
  const matched = typeof body?.matched_line === "string" ? body.matched_line : ""
  const read = asRecord(body?.read)
  const text = typeof read?.text === "string" ? read.text : waited.stdout
  if (matched !== PROBE_MARKER && !text.includes(PROBE_MARKER)) {
    throw new Error(`sum probe mismatch: expected ${PROBE_MARKER}`)
  }
  const snippet = text.trim().split("\n").slice(-8).join("\n")
  return {
    summary: `ok · ${PROBE_A}+${PROBE_B}=${PROBE_SUM} · pane ${paneId}`,
    matched: matched || PROBE_MARKER,
    snippet,
  }
}

export async function handleHerdrStatus(deps: SlashDeps, output: { parts: unknown[] }, toast: ToastFn) {
  const snapshot = await deps.refresh()
  const message = runtimeSummary(snapshot)
  await finishSlash(output, toast, {
    title: "Herdr status",
    message,
    variant: snapshot.herdr && snapshot.targets.length ? "success" : snapshot.herdr ? "warning" : "error",
    summary: message,
    postSession: deps.postSession,
    conversation: true,
  })
}

export async function handleHerdrTest(deps: SlashDeps, output: { parts: unknown[] }, toast: ToastFn) {
  const snapshot = await deps.refresh()
  const smoke = runtimeSummary(snapshot)
  let agentProbe = "skipped: not inside Herdr (HERDR_ENV unset)"
  let steps: string[] = []
  let snippet = ""
  let matched = ""
  let prompt = ""
  let runtime = ""
  if (process.env.HERDR_ENV === "1") {
    try {
      const ctx = deps.runtimeCtx()
      runtime = resolveTestRuntime(snapshot, deps.defaultRuntime)
      const result = await probeAgentRoundtrip({
        run: deps.run,
        pool: deps.pool(),
        workspace: ctx.workspace,
        cwd: deps.directory,
        runtime,
        keepPanes: deps.keepPanes,
      })
      agentProbe = result.summary
      steps = result.steps
      snippet = result.snippet
      matched = result.matched
      prompt = result.prompt
      runtime = result.runtime
    } catch (error) {
      agentProbe = `failed: ${error instanceof Error ? error.message : "agent probe failed"}`
    }
  }
  const ok = snapshot.herdr && probeOk(agentProbe)
  const message = [
    `**Result:** ${ok ? "PASS" : "FAIL"}`,
    "",
    `**Smoke:** ${smoke}`,
    runtime ? `**Runtime:** ${runtime}` : "",
    `**Agent probe:** ${agentProbe}`,
    "",
    ...(steps.length ? ["### What this session did", ...steps, ""] : []),
    prompt ? `**Prompt sent:** ${prompt}` : "",
    matched ? `**Matched:** \`${matched}\`` : "",
    snippet ? `\n\`\`\`\n${snippet}\n\`\`\`` : "",
  ].filter(Boolean).join("\n")
  await finishSlash(output, toast, {
    title: "Herdr test",
    message,
    variant: ok ? "success" : snapshot.herdr ? "warning" : "error",
    summary: `${ok ? "PASS" : "FAIL"} · ${smoke} · ${agentProbe}`,
    postSession: deps.postSession,
    conversation: true,
  })
}

export async function handleHerdrDelete(deps: SlashDeps, output: { parts: unknown[] }, toast: ToastFn) {
  if (process.env.HERDR_ENV !== "1") {
    const message = "skipped: not inside Herdr (HERDR_ENV unset)"
    await finishSlash(output, toast, {
      title: "Herdr delete",
      message,
      variant: "warning",
      summary: message,
      postSession: deps.postSession,
      conversation: true,
    })
  }
  try {
    const ctx = deps.runtimeCtx()
    const { closed } = await deps.pool().drainJobPanes(ctx.workspace)
    const message = closed.length
      ? `closed ${closed.length} oh-* pane${closed.length === 1 ? "" : "s"}`
      : "no oh-* job panes to close"
    await finishSlash(output, toast, {
      title: "Herdr delete",
      message,
      variant: "success",
      summary: message,
      postSession: deps.postSession,
      conversation: true,
    })
  } catch (error) {
    const message = `failed: ${error instanceof Error ? error.message : "drain failed"}`
    await finishSlash(output, toast, {
      title: "Herdr delete",
      message,
      variant: "error",
      summary: message,
      postSession: deps.postSession,
      conversation: true,
    })
  }
}

export function formatPresenceToast(targets: Target[]) {
  const n = targets.length
  return {
    title: "Herdr ready",
    message: `${n} target${n === 1 ? "" : "s"} · /herdr-status · /herdr-test · /herdr-delete`,
    variant: (n > 0 ? "success" : "warning") as "success" | "warning",
  }
}
