import { isAbsolute, normalize } from "node:path"
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import { HerdrError } from "./errors.js"

export const HERDR_LOCATION_HEADER = "x-opencode-herdr-directory"
export const HERDR_DIRECTORY_HEADER = HERDR_LOCATION_HEADER

export function resolveRequestDirectory(headers: Record<string, string | undefined> | undefined): string {
  const directory = headers?.[HERDR_LOCATION_HEADER]
  if (typeof directory !== "string" || !directory.trim() || !isAbsolute(directory)) {
    throw new HerdrError("Herdr request location is missing a valid absolute directory")
  }
  const normalized = normalize(directory)
  if (normalized !== directory || directory.includes("\0")) {
    throw new HerdrError("Herdr request workspace directory is malformed")
  }
  return directory
}

function validateDirectory(directory: string): string {
  if (!directory.trim() || !isAbsolute(directory) || normalize(directory) !== directory || directory.includes("\0")) {
    throw new HerdrError("Herdr request location must be a normalized absolute directory")
  }
  return directory
}

export function stampRequestDirectory(headers: Record<string, string>, directory: string): Record<string, string> {
  const trusted = validateDirectory(directory)
  const clean = Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== HERDR_LOCATION_HEADER))
  return { ...clean, [HERDR_LOCATION_HEADER]: trusted }
}

export async function executeWithHerdrLocation<T>(
  options: LanguageModelV3CallOptions,
  execute: (directory: string, cleanOptions: LanguageModelV3CallOptions) => Promise<T>,
): Promise<T> {
  return execute(resolveRequestDirectory(options.headers), withoutRequestDirectory(options))
}

/** Remove plugin routing metadata before options reach Herdr's local adapter. */
export function withoutRequestDirectory(options: LanguageModelV3CallOptions): LanguageModelV3CallOptions {
  if (!options.headers || !Object.keys(options.headers).some((name) => name.toLowerCase() === HERDR_DIRECTORY_HEADER)) return options
  const headers = Object.fromEntries(Object.entries(options.headers).filter(([name]) => name.toLowerCase() !== HERDR_DIRECTORY_HEADER))
  const clean = { ...options }
  if (Object.keys(headers).length) clean.headers = headers
  else delete clean.headers
  return clean
}
