import { expect, test } from "bun:test"
import { chmod, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createJob } from "../src/job"
import { nativeResult } from "../src/execution"
import type { Target } from "../src/adapters/types"

const engine = new URL("../bin/opencode-herdr-engine", import.meta.url).pathname
const nativeTest = process.platform === "win32" ? test.skip : test
const target: Target = { id: "cursor/fake", adapter: "cursor", nativeModel: "fake", name: "fake", provenance: "verified", limits: { context: 100, output: 100 }, toolCall: true }

async function fixture(script: string) {
  const root = await mkdtemp(join(tmpdir(), "native-completion-"))
  const job = await createJob("task", root)
  const command = join(job.dir, "command.sh")
  const ready = join(job.dir, "ready")
  await writeFile(command, script.replaceAll("$READY", ready))
  await chmod(command, 0o600)
  const request = await readFile(job.request)
  const child = Bun.spawn(["/bin/sh", engine, job.dir, "--", "/bin/sh", command], { detached: true, stdout: "pipe", stderr: "pipe" })
  const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
  return { root, job, ready, request, child, output }
}

async function waitFor(path: string) {
  for (let i = 0; i < 200 && !await Bun.file(path).exists(); i++) await Bun.sleep(5)
  expect(await Bun.file(path).exists()).toBeTrue()
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  nativeTest(`manual ${signal} publishes readable failure marker and native result`, async () => {
    const f = await fixture("printf ready > \"$READY\"\nexec /bin/sleep 30\n")
    try {
      await waitFor(f.ready)
      process.kill(-f.child.pid, signal)
      expect(await f.child.exited).toBe(signal === "SIGINT" ? 130 : 143)
      expect(await readFile(join(f.job.dir, "exit.status"), "utf8")).toBe(`${signal === "SIGINT" ? 130 : 143}\n`)
      const result = await nativeResult(f.job, target)
      expect(result).toMatchObject({ status: "error", diagnostic: `exit ${signal === "SIGINT" ? 130 : 143}` })
      for (const name of ["stdout.jsonl", "stderr.log", "exit.status"]) expect(((await lstat(join(f.job.dir, name))).mode & 0o077)).toBe(0)
      expect(await readFile(f.job.request)).toEqual(f.request)
    } finally {
      try { process.kill(-f.child.pid, "SIGKILL") } catch {}
      await f.output
      await rm(f.root, { recursive: true, force: true })
    }
  })
}

nativeTest("manual TERM during inherited-writer drain publishes failure instead of waiting for host timeout", async () => {
  const f = await fixture("printf ready > \"$READY\"\n(sleep 30; printf late) &\nexit 0\n")
  try {
    await waitFor(f.ready)
    await Bun.sleep(100)
    expect(await Bun.file(join(f.job.dir, "exit.status")).exists()).toBeFalse()
    process.kill(-f.child.pid, "SIGTERM")
    expect(await f.child.exited).toBe(143)
    expect(await readFile(join(f.job.dir, "exit.status"), "utf8")).toBe("143\n")
    expect(await nativeResult(f.job, target)).toMatchObject({ status: "error", diagnostic: "exit 143" })
    for (const name of ["stdout.jsonl", "stderr.log", "exit.status"]) expect(((await lstat(join(f.job.dir, name))).mode & 0o077)).toBe(0)
    expect(await readFile(f.job.request)).toEqual(f.request)
  } finally {
    try { process.kill(-f.child.pid, "SIGKILL") } catch {}
    await f.output
    await rm(f.root, { recursive: true, force: true })
  }
})

nativeTest("engine help output remains byte-for-byte compatible", async () => {
  const child = Bun.spawn(["/bin/sh", engine, "--help"], { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect(await child.exited).toBe(0)
  expect(stdout).toBe("Usage: opencode-herdr-engine JOB_DIRECTORY -- COMMAND [ARG...]\nInternal opencode-herdr executor; requires an existing private job directory.\nCaptures stdout/stderr privately and publishes exit.status atomically.\nInterrupt through the Herdr foreground process group, not an individual PID.\n")
  expect(stderr).toBe("")
})
