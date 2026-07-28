import { expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { applyRoutingInPlace, readRouting } from "../src/routing"

test("applyRoutingInPlace restores herdr models", () => {
  const dir = mkdtempSync(join(tmpdir(), "herdr-r-"))
  const path = join(dir, "herdr-routing.json")
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, assignments: { "sdd-apply": "herdr/cursor-x" } }))
  const config: any = { agent: { "sdd-apply": { mode: "subagent", model: "openai/wiped", variant: "medium" } } }
  const n = applyRoutingInPlace(config, readRouting(path))
  expect(n).toBe(1)
  expect(config.agent["sdd-apply"]).toEqual({ mode: "subagent", model: "herdr/cursor-x", variant: "medium" })
})

test("applyRoutingInPlace restores variant when present", () => {
  const dir = mkdtempSync(join(tmpdir(), "herdr-r-"))
  const path = join(dir, "herdr-routing.json")
  writeFileSync(path, JSON.stringify({
    schemaVersion: 1,
    assignments: { "sdd-apply": { model: "herdr/cursor-x", variant: "max" } },
  }))
  const config: any = { agent: { "sdd-apply": { mode: "subagent", model: "openai/wiped", variant: "low" } } }
  const n = applyRoutingInPlace(config, readRouting(path))
  expect(n).toBe(1)
  expect(config.agent["sdd-apply"]).toEqual({ mode: "subagent", model: "herdr/cursor-x", variant: "max" })
})
