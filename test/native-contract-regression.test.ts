import { expect, test } from "bun:test"
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createJob } from "../src/job"
import { nativeResult } from "../src/execution"
import { createHerdr } from "../src/provider"
import type { Target } from "../src/adapters/types"

const nativeTest = process.platform === "win32" ? test.skip : test
const target = (adapter: string): Target => ({ id: `${adapter}/m`, adapter, nativeModel: "m", name: "m", provenance: "verified", limits: { context: 1, output: 1 }, toolCall: true })

async function captures(code: number, stdout = "", stderr = "") {
  const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp/opencode", "native-contract-"))
  const job = await createJob("task", root)
  for (const [name, value] of Object.entries({ "exit.status": `${code}\n`, "stdout.jsonl": stdout, "stderr.log": stderr })) {
    await writeFile(join(job.dir, name), value, { mode: 0o600 })
  }
  return { job, cleanup: () => rm(root, { recursive: true, force: true }) }
}

for (const adapter of ["cursor", "claude", "codex", "opencode"]) {
  for (const code of [7, 130, 143]) {
    nativeTest(`${adapter}: uncancelled exit ${code} retains existing error contract`, async () => {
      const f = await captures(code, "", "failure token=secret")
      try {
        expect(await nativeResult(f.job, target(adapter))).toMatchObject({ status: "error", diagnostic: "failure [redacted]" })
      } finally { await f.cleanup() }
    })
  }
  nativeTest(`${adapter}: native result flows through required OpenCode provider`, async () => {
    const event = adapter === "cursor" || adapter === "claude" ? { type: "result", result: "ok token=secret" }
      : adapter === "codex" ? { type: "item.completed", item: { type: "agent_message", text: "ok token=secret" } }
        : { type: "text", part: { text: "ok token=secret" } }
    const f = await captures(0, JSON.stringify(event))
    try {
      const t = target(adapter)
      const model = createHerdr({ targets: [t], execute: () => nativeResult(f.job, t) }).languageModel(t.id)
      expect((await model.doGenerate({ prompt: [] })).content).toEqual([{ type: "text", text: "ok [redacted]" }])
    } finally { await f.cleanup() }
  })
}

for (const name of ["exit.status", "stdout.jsonl", "stderr.log"]) {
  for (const kind of ["public", "symlink"]) {
    nativeTest(`${name}: reject ${kind} without changing stored bytes`, async () => {
      const f = await captures(name === "stderr.log" ? 7 : 0, '{"type":"result","result":"ok"}', "failure")
      try {
        const path = join(f.job.dir, name)
        if (kind === "public") await chmod(path, 0o644)
        else {
          await writeFile(`${path}.saved`, await readFile(path), { mode: 0o600 })
          await rm(path)
          await symlink(`${path}.saved`, path)
        }
        const before = Bun.hash(await readFile(path))
        await expect(nativeResult(f.job, target("cursor"))).rejects.toThrow(kind === "public" ? "unsafe native capture file" : "ELOOP")
        expect(Bun.hash(await readFile(path))).toBe(before)
        expect(await Bun.file(f.job.result).exists()).toBeFalse()
      } finally { await f.cleanup() }
    })
  }
}

nativeTest("native parsing enforces documented bounds", async () => {
  const cases = [
    ["", "invalid adapter output"],
    ["{bad", "invalid adapter output"],
    ["x".repeat(8 * 1024 * 1024 + 1), "adapter event exceeds 8 MiB limit"],
    [Array(9).fill(JSON.stringify({ type: "text", text: "x".repeat(1024 * 1024) })).join("\n"), "adapter response exceeds 8 MiB limit"],
  ] as const
  for (const [stdout, diagnostic] of cases) {
    const f = await captures(0, stdout)
    try { expect(await nativeResult(f.job, target("opencode"))).toMatchObject({ status: "error", diagnostic }) }
    finally { await f.cleanup() }
  }
})
