import { expect, test } from "bun:test"
import { adapterFor, targetId } from "../src/adapters/types"
import { createHerdr } from "../src/provider"

test("targets use exact stable IDs and never fall back", () => {
  expect(targetId("cursor", "agent")).toBe("cursor-YWdlbnQ")
  expect(() => createHerdr({ targets: [] }).languageModel("missing")).toThrow("unavailable")
})

test("only documented adapters are present", () => {
  expect(adapterFor("cursor")?.command).toEqual(["agent", "-p", "--output-format", "stream-json"])
  expect(adapterFor("unknown")).toBeUndefined()
})
