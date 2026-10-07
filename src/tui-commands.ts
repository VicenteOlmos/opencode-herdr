import { stat } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { Plugin } from "@opencode-ai/plugin/tui"
import { refreshSnapshot, type Snapshot } from "./capabilities.js"
import { HerdrController } from "./controller.js"
import { HandoverAbort, HerdrError } from "./errors.js"
import { createHandover, formatHandoverConfirmation, parseHandoverArgs } from "./handover.js"
import { HerdrPool } from "./pool.js"
import { resolvePluginOptions } from "./plugin-options.js"
import { resolvePaneTarget } from "./command.js"
import { handleHerdrDelete, handleHerdrStatus, handleHerdrTest, type SlashDeps, type ToastFn } from "./slash.js"
import { sanitize } from "./sanitize.js"
import { postHerdrFeedback } from "./feedback.js"

type TuiContext = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0]

const herdrId = /^[a-zA-Z0-9._:-]+$/
const run = async (argv: string[]) => {
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: process.env })
  return { code: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() }
}

export async function registerHerdrCommands(context: TuiContext) {
  const flags = resolvePluginOptions(context.options)
  const defaultRuntime = flags.handoverDefault
  const stateDir = join(process.env.XDG_STATE_HOME ?? join(process.env.HOME ?? "/tmp", ".local", "state"), "opencode-herdr")
  let snapshot: Snapshot = { schemaVersion: 1, createdAt: "", herdr: false, runtimes: [], targets: [] }
  let herdr = false
  const apply = (next: Snapshot) => { snapshot = next; herdr = next.herdr }
  const runtimeCtx = (cwd: string) => {
    if (!isAbsolute(cwd)) throw new HerdrError("Herdr local workspace is unavailable")
    const workspace = process.env.HERDR_WORKSPACE_ID
    const tab = process.env.HERDR_TAB_ID
    const pane = process.env.HERDR_PANE_ID
    if (!workspace || !tab || !pane || !herdrId.test(workspace) || !herdrId.test(tab) || !herdrId.test(pane)) {
      throw new HerdrError("valid Herdr runtime context is required on the TUI host")
    }
    return { cwd, workspace, tab, pane }
  }
  const controller = (runtime: ReturnType<typeof runtimeCtx>) => new HerdrController({ root: "/tmp", ...runtime, keepPanes: flags.keepPanes, keepJobs: flags.keepJobs })
  const pool = () => new HerdrPool({ run })
  const refresh = async () => {
    const next = await refreshSnapshot(stateDir, { run })
    apply(next)
    return next
  }
  const routeSession = () => {
    const route = context.ui.router.current()
    if (route.type !== "session") throw new HerdrError("Open a session before running a Herdr command")
    return route.sessionID
  }
  const selectedSession = async () => {
    const sessionID = routeSession()
    const session = context.data.session.get(sessionID)
    const directory = session?.location?.directory
    if (typeof directory !== "string" || !isAbsolute(directory)) {
      throw new HerdrError("Herdr local workspace is unavailable")
    }
    try {
      if (!(await stat(directory)).isDirectory()) throw new Error("not a directory")
    } catch {
      throw new HerdrError("Herdr local workspace is unavailable")
    }
    return { sessionID, directory, runtime: runtimeCtx(directory) }
  }
  const postSession = async (sessionID: string, markdown: string, tuiAlreadyNotified = false) => {
    await postHerdrFeedback((input) => context.client.session.synthetic(input), sessionID, markdown, { tuiAlreadyNotified })
  }
  const deps = (selected: Awaited<ReturnType<typeof selectedSession>>): SlashDeps => ({
    snapshot: () => snapshot,
    refresh,
    runtimeCtx: () => selected.runtime,
    run,
    pool,
    directory: selected.directory,
    defaultRuntime,
    keepPanes: flags.keepPanes,
    propagatePostSessionError: true,
    postSession: (text) => postSession(selected.sessionID, text, true),
  })
  const toastError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    context.ui.toast.show({ title: "Herdr command failed", message: sanitize(message, 1000), variant: "error" })
  }
  const toast: ToastFn = async (input) => { context.ui.toast.show(input) }
  const executeSlash = async (handler: (deps: SlashDeps, output: { parts: unknown[] }, toast: ToastFn) => Promise<void>) => {
    const selected = await selectedSession()
    try {
      await handler(deps(selected), { parts: [] }, toast)
    } catch (error) {
      if (!(error instanceof HandoverAbort)) throw error
    }
  }
  const command = (name: string, description: string, runCommand: (input: string) => Promise<void>) => ({
    id: `opencode-herdr.${name}`,
    title: `/${name}`,
    description,
    group: "Herdr (local TUI)",
    slash: { name, arguments: true as const },
    run: (input?: string) => { void runCommand(input ?? "").catch(toastError) },
  })

  return context.ui.slot({
    append: "app",
    render: () => {
      context.keymap.layer(() => ({
        mode: "base",
        commands: [
          command("herdr-status", "Show Herdr availability on this TUI host", () => executeSlash(handleHerdrStatus)),
          command("herdr-test", "Run Herdr checks on this TUI host", () => executeSlash(handleHerdrTest)),
          command("herdr-delete", "Close Herdr job panes on this TUI host", () => executeSlash(handleHerdrDelete)),
          command("herdr-pane", "Delegate a task from this TUI host. Args: <runtime> <task>", async (input) => {
            const selected = await selectedSession()
            const [runtime, ...parts] = input.trim().split(/\s+/)
            const task = parts.join(" ").trim()
            if (!runtime || !task) throw new HerdrError("Usage: /herdr-pane <runtime> <task>")
            await refresh()
            if (!herdr) throw new HerdrError("Herdr unavailable on the TUI host")
            const target = resolvePaneTarget(snapshot.targets, runtime)
            const result = await controller(selected.runtime).execute(target, { prompt: [{ role: "user", content: [{ type: "text", text: task }] }] })
            if (result.status !== "done") throw new HerdrError(result.diagnostic || "Herdr task failed")
            await postSession(selected.sessionID, result.text ?? "")
          }),
          command("herdr-handover", "Hand over to a Herdr pane from this TUI host. Args: <runtime> [note]", async (input) => {
            const selected = await selectedSession()
            await refresh()
            if (!herdr) throw new HerdrError("Herdr unavailable on the TUI host")
            const ctx = selected.runtime
            const { runtime, note } = parseHandoverArgs(input)
            const result = await createHandover({ sessionId: selected.sessionID, directory: selected.directory, workspace: ctx.workspace, tab: ctx.tab, pane: ctx.pane, runtime, defaultRuntime, note, stateDir, run })
            await postSession(selected.sessionID, formatHandoverConfirmation(result))
          }),
        ],
      }))
      return null
    },
  })
}
