import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const manifest = Bun.TOML.parse(readFileSync(new URL("../herdr-plugin.toml", import.meta.url), "utf8")) as {
  id: string
  name: string
  version: string
  min_herdr_version: string
  description: string
  platforms: string[]
  actions: { id: string; title: string; contexts: string[]; command: string[] }[]
}

test("Herdr marketplace manifest installs the pinned OpenCode integration globally", () => {
  expect(manifest).toMatchObject({
    id: "opencode-herdr",
    name: "OpenCode Herdr",
    version: "0.1.0",
    min_herdr_version: "0.9.3",
    platforms: ["linux", "macos"],
  })
  expect(manifest.description).toBeString()
  expect(manifest.description.trim().length).toBeGreaterThan(0)
  expect(manifest.actions).toEqual([
    {
      id: "install-opencode",
      title: "Install OpenCode integration",
      contexts: ["global"],
      command: ["opencode2", "plugin", "add", "opencode-herdr@0.2.0"],
    },
  ])
})
