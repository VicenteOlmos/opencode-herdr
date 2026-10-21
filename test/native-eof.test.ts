import { expect, test } from "bun:test"
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { createJob, readResult, type JobResultV1 } from "../src/job"
import { executionFor, nativeResult } from "../src/execution"
import type { Target } from "../src/adapters/types"

const engine = new URL("../bin/opencode-herdr-engine", import.meta.url).pathname
const nativeTest = process.platform === "win32" ? test.skip : test
const target: Target = { id: "cursor/fake", adapter: "cursor", nativeModel: "fake", name: "fake", provenance: "verified", limits: { context: 100, output: 100 }, toolCall: true }

async function run(script: string) {
  const root = await mkdtemp(join(tmpdir(), "native-eof-"))
  const command = join(root, "command.sh")
  await writeFile(command, script)
  await chmod(command, 0o600)
  const child = Bun.spawn(["/bin/sh", engine, root, "--", "/bin/sh", command], { stdout: "pipe", stderr: "pipe" })
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  return { root, child, stdout, stderr }
}

nativeTest("native engine waits for inherited stdout EOF and preserves successful output", async () => {
  const f = await run("(sleep 0.3; printf '{\\\"type\\\":\\\"result\\\",\\\"result\\\":\\\"late final\\\"}\\n') &\nexit 0\n")
  try {
    await Bun.sleep(80)
    expect(await Bun.file(join(f.root, "exit.status")).exists()).toBeFalse()
    expect(await f.child.exited).toBe(0)
    expect(await readFile(join(f.root, "stdout.jsonl"), "utf8")).toContain("late final")
    expect(await readFile(join(f.root, "exit.status"), "utf8")).toBe("0\n")
    for (const name of ["stdout.jsonl", "stderr.log", "exit.status"]) expect(((await lstat(join(f.root, name))).mode & 0o077)).toBe(0)
    expect(await Bun.file(join(f.root, "stdout.pipe")).exists()).toBeFalse()
    expect(await Bun.file(join(f.root, "stderr.pipe")).exists()).toBeFalse()
  } finally {
    if (f.child.exitCode === null) { try { process.kill(f.child.pid, "SIGKILL") } catch {} }
    await Promise.all([f.stdout, f.stderr])
    await rm(f.root, { recursive: true, force: true })
  }
})

nativeTest("native engine waits for inherited stderr EOF and preserves direct nonzero status", async () => {
  const f = await run("(sleep 0.3; printf 'late diagnostic\\n' >&2) &\nexit 7\n")
  try {
    await Bun.sleep(80)
    expect(await Bun.file(join(f.root, "exit.status")).exists()).toBeFalse()
    expect(await f.child.exited).toBe(7)
    expect(await readFile(join(f.root, "stderr.log"), "utf8")).toContain("late diagnostic")
    expect(await readFile(join(f.root, "exit.status"), "utf8")).toBe("7\n")
  } finally {
    if (f.child.exitCode === null) { try { process.kill(f.child.pid, "SIGKILL") } catch {} }
    await Promise.all([f.stdout, f.stderr])
    await rm(f.root, { recursive: true, force: true })
  }
})

nativeTest("native engine rejects pre-existing FIFO capture reservations without touching them", async () => {
  for (const name of ["stdout.jsonl", "stdout.pipe", "stderr.pipe"]) {
    const root = await mkdtemp(join(tmpdir(), "native-eof-"))
    try {
      const fifo = join(root, name)
      const create = Bun.spawn(["mkfifo", fifo])
      expect(await create.exited).toBe(0)
      const child = Bun.spawn(["/bin/sh", engine, root, "--", "/bin/true"], { stdout: "pipe", stderr: "pipe" })
      await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
      expect(await child.exited).not.toBe(0)
      expect((await lstat(fifo)).isFIFO()).toBeTrue()
    } finally { await rm(root, { recursive: true, force: true }) }
  }
})

nativeTest("native engine interruption while draining removes FIFOs and owned relay processes", async () => {
  const root = await mkdtemp(join(tmpdir(), "native-eof-"))
  const job = await createJob("task", root)
  const command = join(job.dir, "command.sh")
  await writeFile(command, "(sleep 30; printf late) &\nexit 0\n")
  await chmod(command, 0o600)
  const child = Bun.spawn(["/bin/sh", engine, job.dir, "--", "/bin/sh", command], { detached: true, stdout: "pipe", stderr: "pipe" })
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  try {
    await Bun.sleep(100)
    process.kill(-child.pid, "SIGTERM")
    expect(await child.exited).toBe(143)
    expect(await Bun.file(join(job.dir, "stdout.pipe")).exists()).toBeFalse()
    expect(await Bun.file(join(job.dir, "stderr.pipe")).exists()).toBeFalse()
    expect(await readFile(join(job.dir, "exit.status"), "utf8")).toBe("143\n")
    expect(await nativeResult(job, target)).toMatchObject({ status: "error", diagnostic: "exit 143" })
    try { process.kill(-child.pid, 0); throw new Error("engine process group survived interruption") } catch (error) {
      if (error instanceof Error && error.message === "engine process group survived interruption") throw error
      expect((error as NodeJS.ErrnoException).code).toBe("ESRCH")
    }
  } finally {
    try { process.kill(-child.pid, "SIGKILL") } catch {}
    await Promise.all([stdout, stderr])
    await rm(root, { recursive: true, force: true })
  }
})

nativeTest("native SIGINT interrupts foreground CLI before emergency cleanup", async () => {
  const root = await mkdtemp(join(tmpdir(), "native-eof-sigint-"))
  const bin = join(root, "bin")
  await Bun.write(join(root, "pid"), "")
  await mkdir(bin)
  const command = join(root, "command.sh")
  await writeFile(command, "exec \"$AGENT\"\n")
  await chmod(command, 0o600)
  const agent = join(bin, "agent")
  await writeFile(agent, "#!/bin/sh\nprintf '%s' \"$$\" > \"$PIDFILE\"\nexec /bin/sleep 30\n")
  await chmod(agent, 0o755)
  const child = Bun.spawn(["/bin/sh", engine, root, "--", "/bin/sh", command], { detached: true, stdout: "pipe", stderr: "pipe", env: { ...process.env, AGENT: agent, PIDFILE: join(root, "pid") } })
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  let agentPid = 0
  try {
    for (let i = 0; i < 100 && !agentPid; i++) {
      agentPid = Number(await readFile(join(root, "pid"), "utf8").catch(() => ""))
      if (!agentPid) await Bun.sleep(10)
    }
    expect(agentPid).toBeGreaterThan(0)
    process.kill(-child.pid, "SIGINT")
    expect(await child.exited).toBe(130)
    try { process.kill(agentPid, 0); throw new Error("direct CLI survived SIGINT") } catch (error) {
      if (error instanceof Error && error.message === "direct CLI survived SIGINT") throw error
      expect((error as NodeJS.ErrnoException).code).toBe("ESRCH")
    }
  } finally {
    try { process.kill(-child.pid, "SIGKILL") } catch {}
    await Promise.all([stdout, stderr])
    await rm(root, { recursive: true, force: true })
  }
})

for (const scenario of [
  { name: "stdout success", mode: "stdout", event: '{"type":"result","result":"late final"}', expectedStatus: "done", expectedText: "late final", exit: 0 },
  { name: "stderr failure", mode: "stderr", event: "late diagnostic", expectedStatus: "error", expectedDiagnostic: "late diagnostic\n", exit: 7 },
] as const) {
  nativeTest(`native EOF result matches Bun for delayed ${scenario.name}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "native-eof-parity-"))
    const bin = join(root, "bin")
    await mkdir(bin)
    const agent = join(bin, "agent")
    await writeFile(agent, "#!/bin/sh\nif [ \"$MODE\" = stdout ]; then (sleep 0.25; printf '%s\\n' \"$EVENT\") & exit 0; fi\n(sleep 0.25; printf '%s\\n' \"$EVENT\" >&2) & exit 7\n")
    await chmod(agent, 0o755)
    const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, MODE: scenario.mode, EVENT: scenario.event }
    const outcomes: JobResultV1[] = []
    try {
      for (const backend of ["native", "bun"] as const) {
        const job = await createJob("fixed task", root)
        const requestBefore = await readFile(job.request)
        const requestHash = createHash("sha256").update(requestBefore).digest("hex")
        const plan = executionFor(job, target, "fixed task", undefined, backend)
        if (plan.native) {
          const commandFile = join(job.dir, "command.sh")
          await writeFile(commandFile, plan.script!, { mode: 0o600 })
          await chmod(commandFile, 0o600)
        }
        const child = Bun.spawn(plan.argv, { env, stdout: "pipe", stderr: "pipe" })
        const streams = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
        const [outerCode] = await Promise.all([child.exited, streams])
        expect(outerCode).toBe(backend === "native" ? scenario.exit : 0)
        const result = plan.native ? await nativeResult(job, target) : await readResult(job, target.id)
        const persisted = await readResult(job, target.id)
        expect(result).toEqual(persisted)
        expect(createHash("sha256").update(await readFile(job.request)).digest("hex")).toBe(requestHash)
        if (plan.native) expect(await readFile(join(job.dir, "exit.status"), "utf8")).toBe(`${scenario.exit}\n`)
        outcomes.push(result)
      }
      expect(outcomes[0]?.status).toBe(scenario.expectedStatus)
      expect(outcomes[1]?.status).toBe(scenario.expectedStatus)
      if (scenario.expectedText) {
        expect(outcomes[0]).toMatchObject({ status: "done", text: scenario.expectedText })
        expect(outcomes[1]).toMatchObject({ status: "done", text: scenario.expectedText })
      }
      if (scenario.expectedDiagnostic) {
        expect(outcomes[0]).toMatchObject({ status: "error", diagnostic: scenario.expectedDiagnostic })
        expect(outcomes[1]).toMatchObject({ status: "error", diagnostic: scenario.expectedDiagnostic })
      }
    } finally { await rm(root, { recursive: true, force: true }) }
  })
}
