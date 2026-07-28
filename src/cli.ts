import { HerdrError } from "./errors.js"

export type Run = (argv: string[]) => Promise<{ code: number; stdout: string; stderr?: string }>

export type CliEnvelope = { id?: string; result?: unknown }

export async function defaultRun(argv: string[]): Promise<{ code: number; stdout: string; stderr?: string }> {
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: process.env })
  return { code: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() }
}

/** Unwrap `{ id, result }` CLI envelopes; otherwise parse bare JSON. */
export function parseCliJson(stdout: string): unknown {
  let value: unknown
  try {
    value = JSON.parse(stdout)
  } catch {
    throw new HerdrError("invalid herdr json")
  }
  if (value && typeof value === "object" && "result" in (value as object)) {
    return (value as CliEnvelope).result
  }
  return value
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new HerdrError(`missing ${label}`)
  return value
}
