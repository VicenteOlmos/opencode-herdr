#!/usr/bin/env bun
import { parseArgs } from "node:util"
import { join } from "node:path"
import { createHandover, formatHandoverConfirmation } from "./handover.js"
import { HerdrError } from "./errors.js"

function usage(): never {
  console.error(`usage: opencode-herdr-handover --runtime <id> --session <id> --cwd <path> [--workspace <id>] [--tab <id>] [--pane <id>] [--default-runtime <id>] [--note <text>]`)
  process.exit(2)
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    runtime: { type: "string" },
    session: { type: "string" },
    cwd: { type: "string" },
    workspace: { type: "string" },
    tab: { type: "string" },
    pane: { type: "string" },
    "default-runtime": { type: "string" },
    note: { type: "string" },
  },
  allowPositionals: false,
})

const sessionId = values.session
const directory = values.cwd
const workspace = values.workspace ?? process.env.HERDR_WORKSPACE_ID
const tab = values.tab ?? process.env.HERDR_TAB_ID
const pane = values.pane ?? process.env.HERDR_PANE_ID
const runtime = values.runtime
const defaultRuntime = values["default-runtime"] ?? process.env.OPENCODE_HERDR_HANDOVER_DEFAULT
const note = values.note
if (!sessionId || !directory || !workspace || !tab) usage()

const stateDir = join(process.env.XDG_STATE_HOME ?? join(process.env.HOME ?? "/tmp", ".local", "state"), "opencode-herdr")

try {
  const result = await createHandover({ sessionId, directory, workspace, tab, pane, runtime, defaultRuntime, note, stateDir })
  console.log(formatHandoverConfirmation(result))
} catch (error) {
  const message = error instanceof HerdrError ? error.message : error instanceof Error ? error.message : "handover failed"
  console.error(message)
  process.exit(1)
}
