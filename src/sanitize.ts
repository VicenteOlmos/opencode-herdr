const ANSI = /\x1B\[[0-?]*[ -/]*[@-~]/g
const SECRET = /(?:api[_-]?key|token|password)\s*[=:]\s*[^\s]+/gi
export function sanitize(value: unknown, max = 16_384) {
  return String(value ?? "").replace(ANSI, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").replace(SECRET, "[redacted]").slice(0, max)
}
