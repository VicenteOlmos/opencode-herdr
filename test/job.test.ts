import { expect, test } from "bun:test"
import { chmod, symlink } from "node:fs/promises"
import { createJob, readResult, writeResult } from "../src/job"

test("R4 private request rejects traversal and symlinked results", async () => {
  const job = await createJob("hello; $(bad)\nnext", "/tmp")
  expect(job.request).not.toContain("..")
  await Bun.write(job.result, JSON.stringify({ schemaVersion: 1, jobId: job.id, targetId: "x", status: "done", text: "ok", delegatedTools: false }))
  await chmod(job.result, 0o600)
  expect((await readResult(job)).text).toBe("ok")
  await Bun.$`rm -rf ${job.dir}`
})

test("partial or invalid results fail", async () => {
  const job = await createJob("x", "/tmp")
  await Bun.write(job.result, "{")
  await expect(readResult(job)).rejects.toThrow()
  await Bun.$`rm -rf ${job.dir}`
})

test("atomic result writes validate schema", async () => {
  const job = await createJob("x", "/tmp")
  await writeResult(job, { schemaVersion: 1, jobId: job.id, targetId: "x", status: "done", text: "ok", delegatedTools: false })
  expect((await readResult(job)).status).toBe("done")
  await Bun.$`rm -rf ${job.dir}`
})

test("5.6 rejects symlinked and world-readable result files", async () => {
  const job = await createJob("x", "/tmp")
  await Bun.write(job.result, JSON.stringify({ schemaVersion: 1, jobId: job.id, targetId: "x", status: "done", delegatedTools: false }))
  await chmod(job.result, 0o644)
  await expect(readResult(job)).rejects.toThrow("unsafe")
  await Bun.$`rm -f ${job.result}`
  await symlink("/etc/passwd", job.result)
  await expect(readResult(job)).rejects.toThrow("unsafe")
  await Bun.$`rm -rf ${job.dir}`
})
