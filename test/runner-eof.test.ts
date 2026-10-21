import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createJob } from "../src/job"

for (const adapter of ["cursor", "claude", "codex", "opencode"]) {
  for (const exit of [0, 7]) {
    test(`${adapter}: unterminated final progress survives exit ${exit}`, async () => {
      const root = await mkdtemp("/tmp/opencode/runner-eof-")
      try {
        const bin = join(root, "bin")
        await mkdir(bin)
        const executable = join(bin, adapter === "cursor" ? "agent" : adapter)
        await writeFile(executable, '#!/bin/sh\nprintf \'%s\' "$EVENT"\nprintf \'%s\' "$FAILURE" >&2\nexit "$RUNTIME_EXIT"\n')
        await chmod(executable, 0o755)
        const event = adapter === "cursor" || adapter === "claude"
          ? { type: "result", result: "ignored 🌍" }
          : adapter === "opencode" ? { type: "text", part: { text: "ignored 🌍" } }
            : { type: "item.completed", item: { type: "agent_message", text: "ignored 🌍" } }
        const job = await createJob("hello", root)
        const request = await readFile(job.request, "utf8")
        const child = Bun.spawn([process.execPath, new URL("../src/runner.ts", import.meta.url).pathname, job.dir, `${adapter}/model`, adapter, "model"], {
          env: { PATH: `${bin}:/usr/bin:/bin`, EVENT: JSON.stringify(event), FAILURE: exit ? "failure" : "", RUNTIME_EXIT: String(exit) },
          stdout: "pipe", stderr: "pipe",
        })
        const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
        expect(stdout).toBe("")
        expect(code).toBe(0)
        expect(stderr).toContain(adapter === "cursor" || adapter === "claude" ? "[herdr] finished (done)\n" : "[herdr] assistant: ignored 🌍\n")
        expect(JSON.parse(await readFile(job.result, "utf8"))).toEqual({
          schemaVersion: 1, jobId: job.id, targetId: `${adapter}/model`, status: exit ? "error" : "done",
          ...(exit ? { diagnostic: "failure" } : { text: "ignored 🌍" }), delegatedTools: true,
        })
        expect(await readFile(job.request, "utf8")).toBe(request)
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  }
}
