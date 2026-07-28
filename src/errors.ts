export class HerdrError extends Error {
  constructor(message: string, readonly code = "HERDR_ERROR") { super(message); this.name = "HerdrError" }
}
export class AbortError extends HerdrError { constructor() { super("Herdr request aborted", "ABORTED"); this.name = "AbortError" } }

/** Thrown after a successful mechanical slash command so OpenCode does not submit an LLM turn. */
export class HandoverAbort extends Error {
  readonly name = "HandoverAbort"
  constructor(message: string) {
    super(message)
  }
}
