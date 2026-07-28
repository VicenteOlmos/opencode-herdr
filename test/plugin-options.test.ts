import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import { resolvePluginOptions } from "../src/plugin-options"
import { HerdrController } from "../src/controller"
import { createHerdr } from "../src/provider"
import { JOB_PANE_PREFIX } from "../src/pool"

const target = {
  id: "cursor-agent",
  name: "Cursor agent",
  adapter: "cursor",
  nativeModel: "agent",
  provenance: "verified" as const,
  limits: { context: 1, output: 1 },
  toolCall: false as const,
}

function poolMock(calls: string[][]) {
  return async (argv: string[]) => {
    calls.push(argv)
    if (argv[1] === "tab" && argv[2] === "list") {
      return { code: 0, stdout: JSON.stringify({ result: { tabs: [{ tab_id: "w:tH", workspace_id: "w", label: "opencode-herdr", pane_count: 1 }] } }) }
    }
    if (argv[1] === "pane" && argv[2] === "list") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            panes: [{ pane_id: "w:seed", tab_id: "w:tH", workspace_id: "w", terminal_id: "term-seed" }],
          },
        }),
      }
    }
    if (argv[1] === "pane" && argv[2] === "split") {
      return {
        code: 0,
        stdout: JSON.stringify({ result: { pane: { pane_id: "w:pJob", terminal_id: "term-job", tab_id: "w:tH" } } }),
      }
    }
    return { code: 0, stdout: "{}" }
  }
}

test("resolvePluginOptions debug implies keepPanes+keepJobs", () => {
  const prevDebug = process.env.OPENCODE_HERDR_DEBUG
  const prevPanes = process.env.OPENCODE_HERDR_KEEP_PANES
  const prevJobs = process.env.OPENCODE_HERDR_KEEP_JOBS
  delete process.env.OPENCODE_HERDR_DEBUG
  delete process.env.OPENCODE_HERDR_KEEP_PANES
  delete process.env.OPENCODE_HERDR_KEEP_JOBS
  try {
    expect(resolvePluginOptions({ debug: true })).toEqual({
      debug: true,
      keepPanes: true,
      keepJobs: true,
      handoverDefault: undefined,
    })
    expect(resolvePluginOptions({ keepPanes: true })).toMatchObject({ keepPanes: true, keepJobs: false, debug: false })
    expect(resolvePluginOptions({ handoverDefault: "cursor" }).handoverDefault).toBe("cursor")
  } finally {
    if (prevDebug === undefined) delete process.env.OPENCODE_HERDR_DEBUG
    else process.env.OPENCODE_HERDR_DEBUG = prevDebug
    if (prevPanes === undefined) delete process.env.OPENCODE_HERDR_KEEP_PANES
    else process.env.OPENCODE_HERDR_KEEP_PANES = prevPanes
    if (prevJobs === undefined) delete process.env.OPENCODE_HERDR_KEEP_JOBS
    else process.env.OPENCODE_HERDR_KEEP_JOBS = prevJobs
  }
})

test("controller keepPanes/keepJobs skips close and job rm", async () => {
  const root = await mkdtemp("/tmp/herdr-keep-")
  const calls: string[][] = []
  let jobDir = ""
  const controller = new HerdrController({
    root,
    cwd: "/repo",
    workspace: "w",
    tab: "tab",
    keepPanes: true,
    keepJobs: true,
    run: poolMock(calls),
    result: async (job, selected) => {
      jobDir = job.dir
      return {
        schemaVersion: 1,
        jobId: job.id,
        targetId: selected.id,
        status: "done",
        text: "ok",
        delegatedTools: false,
      }
    },
  })
  const model = createHerdr({ targets: [target], controller }).languageModel(target.id)
  expect((await model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any)).content)
    .toEqual([{ type: "text", text: "ok" }])
  expect(calls.some((argv) => argv[1] === "pane" && argv[2] === "close")).toBeFalse()
  expect(calls.some((argv) => argv[1] === "pane" && argv[2] === "rename" && argv.some((a) => a.startsWith(JOB_PANE_PREFIX)))).toBeTrue()
  expect(existsSync(jobDir)).toBeTrue()
})
