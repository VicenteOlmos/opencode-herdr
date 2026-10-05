import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
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
