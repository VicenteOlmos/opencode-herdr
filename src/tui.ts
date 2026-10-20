import type { Plugin } from "@opencode-ai/plugin/tui"
import { formatFeedbackToast, HERDR_FEEDBACK_SOURCE } from "./feedback.js"
import { registerHerdrCommands } from "./tui-commands.js"
import { registerModelMenu } from "./tui-menu.js"

export const HerdrTuiPlugin: Parameters<typeof Plugin.define>[0] = {
  id: "opencode-herdr.tui",
  async setup(context) {
    const cleanupCommands = await registerHerdrCommands(context)
    const cleanupMenu = registerModelMenu(context)
    const cleanupFeedback = context.data.on("session.inbox.enqueued", (event) => {
      const { item, sessionID } = event.data
      const activeRoute = context.ui.router.current()
      if (activeRoute.type !== "session" || activeRoute.sessionID !== sessionID) return
      if (item.type !== "synthetic") return
      const metadata = item.payload.metadata
      if (metadata?.source !== HERDR_FEEDBACK_SOURCE || metadata.tuiAlreadyNotified === true) return
      const toast = formatFeedbackToast({
        source: metadata?.source,
        title: metadata?.title,
        variant: metadata?.variant,
        text: item.payload.text,
      })
      if (toast) context.ui.toast.show(toast)
    })
    return () => {
      cleanupFeedback()
      cleanupCommands()
      cleanupMenu()
    }
  },
}

export default HerdrTuiPlugin
