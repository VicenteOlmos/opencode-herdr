import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { HerdrController } from "../src/controller.js"
import { formatFeedbackToast, postHerdrFeedback } from "../src/feedback.js"
import { HerdrTuiPlugin } from "../src/tui.js"

function createNativeTuiContext(extra: Record<string, unknown> = {}) {
  let owner = false
  const layers: Array<() => { commands?: Array<{ group?: string; slash?: { name: string; arguments?: true }; run: (...args: any[]) => unknown }> }> = []
  let slotDisposed = false
  const ui = {
    toast: { show: (_toast?: unknown) => undefined },
    router: { current: () => ({ type: "home" }) },
    slot(claim: { append: string; render: (input: Record<string, never>) => unknown }) {
      expect(claim.append).toBe("app")
      owner = true
      try {
        claim.render({})
      } finally {
        owner = false
      }
      return () => { slotDisposed = true }
    },
  }
  const context = {
    ...extra,
    location: (extra.location as object | undefined) ?? { directory: process.cwd() },
    data: { on: () => () => undefined, session: { get: () => undefined }, ...(extra.data as object | undefined) },
    ui: { ...ui, ...(extra.ui as object | undefined) },
    keymap: {
      layer(callback: (input: Record<string, never>) => ReturnType<(typeof layers)[number]>) {
        if (!owner) throw new Error("Keymap.Provider is missing")
        layers.push(() => callback({}))
      },
    },
  }
  return { context, layers, slotDisposed: () => slotDisposed }
}

describe("OpenCode V2 TUI companion", () => {
  test("is exposed through the published package export", async () => {
    const packageJson = JSON.parse(await readFile(join(import.meta.dir, "..", "package.json"), "utf8"))
    expect(packageJson.exports["./tui"]).toBe("./src/tui.ts")
  })

  test("registers Herdr mechanical commands as native local slash callbacks", async () => {
    const { context, layers, slotDisposed } = createNativeTuiContext()
    const cleanup = await HerdrTuiPlugin.setup(context as any)
    const commands = layers[0]?.()?.commands ?? []
    expect(commands.map((command) => command.slash?.name)).toEqual([
      "herdr-status", "herdr-test", "herdr-delete", "herdr-pane", "herdr-handover",
    ])
    expect(commands.every((command) => command.slash?.arguments === true)).toBeTrue()
    expect(commands.every((command) => command.group === "Herdr (local TUI)")).toBeTrue()
    await cleanup?.()
    expect(slotDisposed()).toBeTrue()
  })

  test("binds pane execution to the selected session directory before refresh awaits", async () => {
    const root = await mkdtemp(join(tmpdir(), "herdr-tui-location-"))
    const directoryA = join(root, "workspace-a")
    const directoryB = join(root, "workspace-b")
    await mkdir(directoryA)
    await mkdir(directoryB)
    const envKeys = ["HOME", "XDG_STATE_HOME", "HERDR_WORKSPACE_ID", "HERDR_TAB_ID", "HERDR_PANE_ID"]
    const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
    const previousSpawn = Bun.spawn
    const previousExecute = HerdrController.prototype.execute
    const executions: string[] = []
    const feedback: any[] = []
    let currentSessionID = "session-b"
    let startRefresh!: () => void
    let releaseRefresh!: (code: number) => void
    let finishFeedback!: () => void
    const refreshStarted = new Promise<void>((resolve) => { startRefresh = resolve })
    const refreshGate = new Promise<number>((resolve) => { releaseRefresh = resolve })
    const feedbackFinished = new Promise<void>((resolve) => { finishFeedback = resolve })
    let cleanup: (() => void | Promise<void>) | undefined
    process.env.HOME = root
    process.env.XDG_STATE_HOME = join(root, "state")
    process.env.HERDR_WORKSPACE_ID = "workspace-1"
    process.env.HERDR_TAB_ID = "workspace-1:tab-1"
    process.env.HERDR_PANE_ID = "workspace-1:pane-1"
    Bun.spawn = ((argv: string[]) => {
      let code = 1
      let stdout = ""
      let exited = Promise.resolve(code)
      if (argv[0] === "herdr" && argv[1] === "--version") {
        code = 0
        stdout = "1.0.0\n"
        startRefresh()
        exited = refreshGate
      } else if (argv[0] === "agent" && argv[1] === "models") {
        code = 0
        stdout = "auto - Auto (default)\n"
        exited = Promise.resolve(code)
      }
      return {
        exited,
        stdout: new Response(stdout).body!,
        stderr: new Response("").body!,
      }
    }) as unknown as typeof Bun.spawn
    HerdrController.prototype.execute = async function () {
      executions.push((this as any).options.cwd)
      return { status: "done", text: "fake task result" } as any
    }
    try {
      const { context, layers } = createNativeTuiContext({
        options: {},
        location: { directory: directoryA },
        data: {
          session: {
            get: (sessionID: string) => ({
              location: { directory: sessionID === "session-b" ? directoryB : directoryA },
            }),
          },
        },
        ui: { router: { current: () => ({ type: "session", sessionID: currentSessionID }) } },
        client: {
          session: {
            synthetic: async (payload: unknown) => {
              feedback.push(payload)
              finishFeedback()
            },
          },
        },
      })
      const registration = await HerdrTuiPlugin.setup(context as any)
      cleanup = typeof registration === "function" ? registration : undefined
      const command = layers[0]?.()?.commands?.find((item) => item.slash?.name === "herdr-pane")
      command?.run("cursor task")
      await refreshStarted
      currentSessionID = "session-a"
      releaseRefresh(0)
      await feedbackFinished
      expect(executions).toEqual([directoryB])
      expect(feedback[0]).toMatchObject({ sessionID: "session-b" })
    } finally {
      await cleanup?.()
      Bun.spawn = previousSpawn
      HerdrController.prototype.execute = previousExecute
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      await rm(root, { recursive: true, force: true })
    }
  })

  for (const commandName of ["herdr-pane", "herdr-test", "herdr-handover"]) {
    for (const invalidLocation of [undefined, "https://remote.example/workspace", "relative/path", join(tmpdir(), `missing-${crypto.randomUUID()}`)]) {
      test(`${commandName} fails closed for selected session location ${String(invalidLocation)}`, async () => {
        const root = await mkdtemp(join(tmpdir(), "herdr-tui-invalid-location-"))
        const envKeys = ["HOME", "XDG_STATE_HOME", "HERDR_WORKSPACE_ID", "HERDR_TAB_ID", "HERDR_PANE_ID"]
        const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
        const previousSpawn = Bun.spawn
        const previousExecute = HerdrController.prototype.execute
        const spawned: string[][] = []
        const executions: string[] = []
        const toasts: any[] = []
        let cleanup: (() => void | Promise<void>) | undefined
        process.env.HOME = root
        process.env.XDG_STATE_HOME = join(root, "state")
        process.env.HERDR_WORKSPACE_ID = "workspace-1"
        process.env.HERDR_TAB_ID = "workspace-1:tab-1"
        process.env.HERDR_PANE_ID = "workspace-1:pane-1"
        Bun.spawn = ((argv: string[]) => {
          spawned.push(argv)
          return { exited: Promise.resolve(1), stdout: new Response("").body!, stderr: new Response("").body! }
        }) as unknown as typeof Bun.spawn
        HerdrController.prototype.execute = async function () {
          executions.push((this as any).options.cwd)
          return { status: "done", text: "unexpected" } as any
        }
        try {
          const { context, layers } = createNativeTuiContext({
            options: {},
            location: { directory: root },
            data: { session: { get: () => invalidLocation === undefined ? undefined : { location: { directory: invalidLocation } } } },
            ui: {
              router: { current: () => ({ type: "session", sessionID: "session-invalid" }) },
              toast: { show: (toast: unknown) => { toasts.push(toast) } },
            },
          })
          const registration = await HerdrTuiPlugin.setup(context as any)
          cleanup = typeof registration === "function" ? registration : undefined
          const command = layers[0]?.()?.commands?.find((item) => item.slash?.name === commandName)
          command?.run(commandName === "herdr-pane" ? "cursor task" : commandName === "herdr-handover" ? "cursor" : "")
          await new Promise((resolve) => setTimeout(resolve, 25))
          expect(spawned).toEqual([])
          expect(executions).toEqual([])
          expect(toasts).toContainEqual(expect.objectContaining({ message: expect.stringContaining("local workspace is unavailable") }))
        } finally {
          await cleanup?.()
          Bun.spawn = previousSpawn
          HerdrController.prototype.execute = previousExecute
          for (const [key, value] of Object.entries(previousEnv)) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
          }
          await rm(root, { recursive: true, force: true })
        }
      })
    }
  }

  test("shows server-enqueued Herdr feedback only for the active session", async () => {
    let onEvent: ((event: any) => void) | undefined
    let unsubscribed = false
    const toasts: unknown[] = []
    const { context, slotDisposed } = createNativeTuiContext({
      options: {},
      data: {
        on(type: string, handler: (event: any) => void) {
          expect(type).toBe("session.inbox.enqueued")
          onEvent = handler
          return () => { unsubscribed = true }
        },
      },
      ui: {
        toast: { show: (toast: unknown) => { toasts.push(toast) } },
        router: { current: () => ({ type: "session", sessionID: "session-1" }) },
      },
    })
    const cleanup = await HerdrTuiPlugin.setup(context as any)
    const event = (sessionID: string, type: string, source: string, text: string) => ({
      data: { sessionID, inboxID: "inbox-1", item: { type, payload: { text, metadata: { source, title: "Herdr status", variant: "info" } } } },
    })
    onEvent?.(event("session-2", "synthetic", "opencode-herdr", "other session"))
    onEvent?.(event("session-1", "user", "opencode-herdr", "user input"))
    onEvent?.(event("session-1", "synthetic", "other", "unrelated"))
    expect(toasts).toEqual([])
    let published: any
    await postHerdrFeedback(async (payload) => {
      published = payload
      onEvent?.({ data: { sessionID: payload.sessionID, inboxID: "inbox-2", item: { type: "synthetic", payload } } })
    }, "session-1", "## Herdr status\n\nHerdr ready · 3 targets")
    expect(published).toMatchObject({
      sessionID: "session-1",
      resume: false,
      metadata: { source: "opencode-herdr", title: "Herdr status", variant: "info" },
    })
    expect(toasts).toEqual([{
      title: "Herdr status",
      message: "Herdr ready · 3 targets",
      variant: "info",
    }])
    await cleanup?.()
    expect(unsubscribed).toBeTrue()
    expect(slotDisposed()).toBeTrue()
  })

  test("does not repeat a TUI-owned direct command toast for its enqueued feedback", async () => {
    let onEvent: ((event: any) => void) | undefined
    const toasts: unknown[] = []
    const { context } = createNativeTuiContext({
      options: {},
      data: { on: (_type: string, handler: (event: any) => void) => { onEvent = handler; return () => undefined } },
      ui: {
        toast: { show: (toast: unknown) => { toasts.push(toast) } },
        router: { current: () => ({ type: "session", sessionID: "session-1" }) },
      },
    })
    const cleanup = await HerdrTuiPlugin.setup(context as any)
    const directToast = { title: "Herdr status", message: "Herdr is ready", variant: "success" }
    context.ui.toast.show(directToast)
    let published: any
    await postHerdrFeedback(async (payload) => {
      published = payload
      onEvent?.({ data: { sessionID: payload.sessionID, inboxID: "inbox-3", item: { type: "synthetic", payload } } })
    }, "session-1", "## Herdr status\n\nHerdr is ready", { tuiAlreadyNotified: true })
    expect(published.metadata.tuiAlreadyNotified).toBeTrue()
    expect(toasts).toEqual([directToast])
    await cleanup?.()
  })

  test("propagates synthetic feedback admission failures", async () => {
    await expect(postHerdrFeedback(async () => { throw new Error("synthetic admission failed") }, "s", "## Herdr pane\n\nDone"))
      .rejects.toThrow("synthetic admission failed")
  })

  test("formats synthetic command feedback without triggering model work", () => {
    expect(formatFeedbackToast({
      source: "opencode-herdr",
      title: "Herdr handover",
      text: "## Herdr handover\n\nHandover created.",
      variant: "info",
    })).toEqual({ title: "Herdr handover", message: "Handover created.", variant: "info" })
    expect(formatFeedbackToast({ source: "other", title: "Unrelated", text: "hello" })).toBeUndefined()
  })
})
