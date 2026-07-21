import { HerdrError } from "./errors.js"

export function taskFromPrompt(prompt: unknown) {
  if (!Array.isArray(prompt)) throw new HerdrError("unsupported prompt")
  const text: string[] = []
  for (const message of prompt as any[]) {
    if (typeof message?.content === "string") text.push(message.content)
    else if (Array.isArray(message?.content)) for (const part of message.content) if (part?.type === "text" && typeof part.text === "string") text.push(part.text)
  }
  if (!text.length) throw new HerdrError("prompt has no text")
  return text.join("\n")
}
