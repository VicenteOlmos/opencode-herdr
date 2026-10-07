export type FeedbackVariant = "info" | "success" | "warning" | "error"

export const HERDR_FEEDBACK_SOURCE = "opencode-herdr"

export function feedbackMetadata(title: string, variant: FeedbackVariant = "info") {
  return { source: HERDR_FEEDBACK_SOURCE, title, variant }
}

type SyntheticFeedback = {
  sessionID: string
  description: string
  text: string
  resume: false
  metadata: ReturnType<typeof feedbackMetadata>
}

export async function postHerdrFeedback(
  send: (feedback: SyntheticFeedback) => Promise<unknown>,
  sessionID: string,
  text: string,
  options: { tuiAlreadyNotified?: boolean } = {},
) {
  const title = text.match(/^##\s+([^\r\n]+)/)?.[1]?.trim() || "Herdr command result"
  const failed = /error|failed/i.test(title) || /\*\*Result:\*\* FAIL/.test(text)
  const succeeded = /result|handover|delete/i.test(title) || /\*\*Result:\*\* PASS/.test(text)
  const variant: FeedbackVariant = failed ? "error" : succeeded ? "success" : "info"
  return send({
    sessionID,
    description: "Herdr command result",
    text,
    resume: false,
    metadata: {
      ...feedbackMetadata(title, variant),
      ...(options.tuiAlreadyNotified ? { tuiAlreadyNotified: true } : {}),
    },
  })
}

export function formatFeedbackToast(input: {
  source?: unknown
  title?: unknown
  text?: unknown
  variant?: unknown
}) {
  if (input.source !== HERDR_FEEDBACK_SOURCE || typeof input.text !== "string") return undefined
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Herdr"
  const message = input.text.replace(/^##\s+[^\r\n]+\r?\n+/, "").replace(/\s+/g, " ").trim()
  const variant: FeedbackVariant = input.variant === "success" || input.variant === "warning" || input.variant === "error"
    ? input.variant
    : "info"
  const clipped = message.length > 320 ? `${message.slice(0, 319)}…` : message
  return { title, message: clipped || title, variant }
}
