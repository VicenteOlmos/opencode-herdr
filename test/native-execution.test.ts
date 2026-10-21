import { expect, test } from "bun:test"
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { HerdrController } from "../src/controller"
import { createHerdr } from "../src/provider"
import { createJob } from "../src/job"
import { adapterArgv } from "../src/effort"
import { executionFor } from "../src/execution"
import type { Target } from "../src/adapters/types"

const engine = new URL("../bin/opencode-herdr-engine", import.meta.url).pathname
const nativeTest = process.platform === "win32" ? test.skip : test
const fixtureRoot = join(tmpdir(), "native-execution-")
const targetFor = (adapter: string): Target => ({ id: `${adapter}/model`, adapter, nativeModel: "model", name: adapter, provenance: "verified", limits: { context: 100, output: 100 }, toolCall: true })

async function fixture(adapter: string, mode = "ok", keep = false, timeout = 3_000) {
  const root = await mkdtemp(fixtureRoot)
  const bin = join(root, "bin")
  await mkdir(bin)
  const event = adapter === "cursor" || adapter === "claude" ? { type: "result", result: "done 🌍 token=secret" }
    : adapter === "codex" ? { type: "item.completed", item: { type: "agent_message", text: "done 🌍 token=secret" } }
      : { type: "text", part: { text: "done 🌍 token=secret" } }
  const executable = join(bin, adapter === "cursor" ? "agent" : adapter)
  await writeFile(executable, '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$ARGS"\nprintf ready > "$READY"\nif [ "$MODE" = wait ]; then sleep 30; fi\nif [ "$MODE" = bad ]; then printf \'{bad\'; else printf \'%s\' "$EVENT"; fi\nif [ "$MODE" = error ]; then printf \'failure token=secret\' >&2; exit 7; fi\n')
  await chmod(executable, 0o755)
  const calls: string[][] = []
  const children: ReturnType<typeof Bun.spawn>[] = []
  const logs: Promise<string>[] = []
  let jobDir = ""
  const run = async (argv: string[]) => {
    calls.push(argv)
    if (argv[1] === "tab" && argv[2] === "list") return { code: 0, stdout: JSON.stringify({ tabs: [{ tab_id: "t", workspace_id: "w", label: "opencode-herdr" }] }) }
    if (argv[1] === "pane" && argv[2] === "list") return { code: 0, stdout: JSON.stringify({ panes: [{ pane_id: "seed", terminal_id: "seed-term", tab_id: "t", workspace_id: "w" }] }) }
    if (argv[2] === "split") return { code: 0, stdout: JSON.stringify({ pane: { pane_id: "job", terminal_id: "job-term", tab_id: "t" } }) }
    if (argv[2] === "run") {
      jobDir = argv[6]!
      const child = Bun.spawn(argv.slice(4), { detached: true, stdout: "pipe", stderr: "pipe", env: {
        PATH: `${bin}:/usr/bin:/bin`, EVENT: JSON.stringify(event), MODE: mode, ARGS: join(root, "args"), READY: join(root, "ready"),
      } })
      children.push(child)
      logs.push(new Response(child.stdout).text(), new Response(child.stderr).text())
    }
    if (argv[2] === "send-keys" || argv[2] === "close") {
      for (const child of children) {
        try { process.kill(-child.pid, argv[2] === "send-keys" ? "SIGINT" : "SIGTERM") } catch {}
      }
    }
    return { code: 0, stdout: "{}" }
  }
  const target = targetFor(adapter)
  const controller = new HerdrController({ root, cwd: root, workspace: "w", run, keepJobs: keep, resultTimeoutMs: timeout, runner: "native" })
  const cleanup = async () => {
    for (const child of children) { try { process.kill(-child.pid, "SIGKILL") } catch {} }
    await Promise.all(children.map((child) => child.exited))
    await Promise.all(logs)
    await rm(root, { recursive: true, force: true })
  }
  return { root, calls, target, controller, cleanup, job: () => jobDir }
}

for (const adapter of ["cursor", "claude", "codex", "opencode"]) {
  nativeTest(`${adapter}: required OpenCode provider uses native execution with exact model/effort argv`, async () => {
    const f = await fixture(adapter, "ok", true)
    try {
      const task = "---\n$HOME ; $(false) 'quoted'"
      const result = await createHerdr({ targets: [f.target], controller: f.controller }).languageModel(f.target.id).doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: task }] }], providerOptions: { herdr: { effort: "high" } },
      })
      expect(result.content).toEqual([{ type: "text", text: "done 🌍 [redacted]" }])
      expect((await readFile(join(f.root, "args"), "utf8")).trimEnd()).toBe(adapterArgv(adapter, "model", task, "high").slice(1).join("\n"))
      const command = f.calls.find((argv) => argv[2] === "run")!
      expect(command.some((arg) => arg.endsWith("opencode-herdr-engine"))).toBeTrue()
      expect(command.some((arg) => arg.endsWith("runner.ts"))).toBeFalse()
      for (const name of ["stdout.jsonl", "stderr.log", "exit.status", "result.json"]) {
        expect((await lstat(join(f.job(), name))).mode & 0o077).toBe(0)
      }
      expect(f.calls.some((argv) => argv[2] === "release-agent")).toBeTrue()
      expect(f.calls.some((argv) => argv[2] === "close")).toBeTrue()
    } finally { await f.cleanup() }
  })
}

for (const mode of ["error", "bad"]) {
  nativeTest(`native ${mode} returns structured failure and cleans owned job files`, async () => {
    const f = await fixture("cursor", mode)
    try {
      const result = await f.controller.execute(f.target, { prompt: [{ role: "user", content: [{ type: "text", text: "task" }] }] })
      expect(result.status).toBe("error")
      expect(result.diagnostic).toBe(mode === "error" ? "failure [redacted]" : "invalid adapter output")
      expect(await Bun.file(join(f.job(), "request.json")).exists()).toBeFalse()
    } finally { await f.cleanup() }
  })
}

nativeTest("native timeout closes the owned process group and removes private captures", async () => {
  const f = await fixture("cursor", "wait", false, 500)
  try {
    await expect(f.controller.execute(f.target, { prompt: [{ role: "user", content: [{ type: "text", text: "task" }] }] })).rejects.toThrow("timeout")
    expect(f.calls.some((argv) => argv[2] === "close")).toBeTrue()
    expect(await Bun.file(join(f.job(), "stdout.jsonl")).exists()).toBeFalse()
  } finally { await f.cleanup() }
})

nativeTest("native cancellation interrupts execution and preserves existing AbortError behavior", async () => {
  const f = await fixture("cursor", "wait")
  try {
    const abort = new AbortController()
    const result = f.controller.execute(f.target, { prompt: [{ role: "user", content: [{ type: "text", text: "task" }] }], abortSignal: abort.signal }).catch((error) => error)
    for (let i = 0; i < 100 && !await Bun.file(join(f.root, "ready")).exists(); i++) await Bun.sleep(5)
    abort.abort()
    expect(await result).toMatchObject({ name: "AbortError", message: "Herdr request aborted" })
    expect(f.calls.some((argv) => argv[2] === "send-keys" && argv.at(-1) === "ctrl+c")).toBeTrue()
    expect(await Bun.file(join(f.job(), "stdout.jsonl")).exists()).toBeFalse()
  } finally { await f.cleanup() }
})

test("Bun fallback remains selectable; unknown explicit runner selection is rejected", async () => {
  const root = await mkdtemp(fixtureRoot)
  try {
    const job = await createJob("task", root)
    expect(executionFor(job, targetFor("cursor"), "task", undefined, "bun").argv[1]).toContain("runner.ts")
    expect(() => executionFor(job, targetFor("cursor"), "task", undefined, "unknown")).toThrow("unsupported runner")
    if (process.platform !== "win32") expect(() => executionFor(job, { ...targetFor("cursor"), nativeModel: "model\nunsafe" }, "task", undefined, "native")).toThrow("unsafe agent arg")
  } finally { await rm(root, { recursive: true, force: true }) }
})

nativeTest("engine refuses pre-existing capture symlinks without changing the target", async () => {
  const root = await mkdtemp(fixtureRoot)
  try {
    const sentinel = join(root, "sentinel")
    await writeFile(sentinel, "unchanged")
    await symlink(sentinel, join(root, "stdout.jsonl"))
    const child = Bun.spawn(["/bin/sh", engine, root, "--", "/bin/echo", "changed"], { stdout: "pipe", stderr: "pipe" })
    await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(await child.exited).not.toBe(0)
    expect(await readFile(sentinel, "utf8")).toBe("unchanged")
  } finally { await rm(root, { recursive: true, force: true }) }
})
