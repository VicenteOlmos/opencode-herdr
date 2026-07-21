import { expect, test } from "bun:test"
import { discover, publishSnapshot, readSnapshot, refreshSnapshot } from "../src/capabilities"
import { herdrTools } from "../src/command"
import { createHerdr } from "../src/provider"

const run = async (argv: string[]) =>
  argv[0] === "herdr"
    ? { code: 0, stdout: "herdr 1.0\n" }
    : { code: 0, stdout: '{"models":["agent"]}\n' }

test("R1 does not advertise tools for adapters that cannot delegate them", async () => {
  const snapshot = await discover({ run, adapters: [{ id: "plain", command: ["plain"], modelsArg: ["plain", "models"], toolCall: false, limits: { context: 1, output: 1 }, parseModels: () => [{ id: "x" }] }] })
  expect(snapshot.targets[0]?.toolCall).toBeFalse()
})

test("writes and reads a complete atomic snapshot", async () => {
  const dir = await mkdtemp("herdr-cap-")
  const snapshot = await discover({ run })
  await publishSnapshot(dir, snapshot)
  expect((await readSnapshot(dir))?.schemaVersion).toBe(1)
})

test("malformed discovery is unknown, not invented", async () => {
  const snapshot = await discover({ run: async () => ({ code: 0, stdout: "not-json" }) })
  expect(snapshot.targets).toEqual([])
  expect(snapshot.runtimes.every((item) => item.provenance === "unknown")).toBeTrue()
})

test("7.2 missing Herdr retains stale diagnostics but removes executable catalog targets", async () => {
  const dir = await mkdtemp("herdr-stale-")
  await publishSnapshot(dir, await discover({ run }))
  const stale = await refreshSnapshot(dir, { run: async () => ({ code: 1, stdout: "", stderr: "missing" }) })
  expect(stale.stale).toBeTrue()
  expect(stale.herdr).toBeFalse()
  expect(stale.diagnostic).toContain("unavailable")
  expect(stale.runtimes.length).toBeGreaterThan(0)
  expect(stale.targets).toEqual([])
  const tools: any = herdrTools(() => stale.targets, () => ({ execute: async () => { throw new Error("must not execute") } }) as any, undefined, () => stale.herdr)
  await expect(tools.herdr_capabilities.execute({}, {})).rejects.toThrow("unavailable")
  await expect(tools.herdr_pane.execute({ target: "stale", task: "x" }, {})).rejects.toThrow("unavailable")
  expect(() => createHerdr({ targets: stale.targets }).languageModel("stale")).toThrow("unavailable")
})

test("5.5 timeout becomes a sanitized unknown diagnostic", async () => {
  const snapshot = await discover({ run: async () => await new Promise(() => {}), timeoutMs: 1 })
  expect(snapshot.herdr).toBeFalse()
  expect(snapshot.runtimes[0]?.diagnostic).toContain("timed out")
})

async function mkdtemp(prefix: string) {
  return Bun.$`mktemp -d /tmp/${prefix}XXXXXX`.text()
}
