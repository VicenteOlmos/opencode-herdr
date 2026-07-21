export class HerdrError extends Error {
  constructor(message: string, readonly code = "HERDR_ERROR") { super(message); this.name = "HerdrError" }
}
export class AbortError extends HerdrError { constructor() { super("Herdr request aborted", "ABORTED"); this.name = "AbortError" } }
