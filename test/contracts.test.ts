import { expect, test } from "bun:test"
import { adapterFor, canonicalizeHerdrModelRef, legacyTargetId, parseTargetId, resolveTarget, targetId, type Target } from "../src/adapters/types"
import { createHerdr } from "../src/provider"

test("targets use exact stable IDs and never fall back", () => {
  expect(targetId("cursor", "agent")).toBe("cursor/agent")
  expect(targetId("cursor", "composer-2.5")).toBe("cursor/composer-2.5")
  expect(() => createHerdr({ targets: [] }).languageModel("missing")).toThrow("unavailable")
})

test("legacy base64 ids still resolve to the readable target", () => {
  const target: Target = {
    id: targetId("cursor", "composer-2.5"),
    name: "cursor composer-2.5",
    adapter: "cursor",
    nativeModel: "composer-2.5",
    provenance: "known",
    toolCall: true,
    limits: { context: 1, output: 1 },
  }
  expect(legacyTargetId("cursor", "composer-2.5")).toBe("cursor-Y29tcG9zZXItMi41")
  expect(parseTargetId("cursor-Y29tcG9zZXItMi41")).toEqual({ adapter: "cursor", nativeModel: "composer-2.5" })
  expect(canonicalizeHerdrModelRef("herdr/cursor-Y29tcG9zZXItMi41")).toBe("herdr/cursor/composer-2.5")
  expect(resolveTarget([target], "cursor-Y29tcG9zZXItMi41")?.id).toBe("cursor/composer-2.5")
  expect(createHerdr({ targets: [target], execute: async () => ({ schemaVersion: 1, jobId: "j", targetId: target.id, status: "done", text: "ok", delegatedTools: false }) }).languageModel("cursor-Y29tcG9zZXItMi41")).toBeTruthy()
})

test("only documented adapters are present", () => {
  expect(adapterFor("cursor")?.command).toEqual(["agent", "-p", "--output-format", "stream-json"])
  expect(adapterFor("unknown")).toBeUndefined()
})
