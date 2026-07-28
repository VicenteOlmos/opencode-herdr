import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { herdrKindLaunch, interactiveArgv, availableRuntimes } from "../src/adapters/types"
import { buildHandoverPrompt, createHandover, formatHandoverConfirmation, parseHandoverArgs, resolveRuntime } from "../src/handover"
import { injectConfig } from "../src/opencode-config"
import { resolvePaneTarget } from "../src/command"
import { JOB_PANE_PREFIX } from "../src/pool"

const target = { id: "cursor-YWdlbnQ", name: "Cursor agent", adapter: "cursor", nativeModel: "agent", provenance: "verified" as const, limits: { context: 32, output: 8 }, toolCall: false }

test("resolveRuntime requires arg or configured default", () => {
  expect(resolveRuntime("cursor", undefined, ["cursor", "claude"])).toBe("cursor")
  expect(resolveRuntime(undefined, "claude", ["cursor", "claude"])).toBe("claude")
  expect(() => resolveRuntime(undefined, undefined, ["cursor"])).toThrow("runtime is required")
  expect(() => resolveRuntime("missing", undefined, ["cursor"])).toThrow("unknown runtime")
  expect(() => resolveRuntime("cursor", undefined, ["claude"])).toThrow("runtime unavailable")
})

test("interactive argv and herdr kind launch", () => {
  expect(interactiveArgv("cursor", "/tmp/project")).toEqual(["agent", "--workspace", "/tmp/project"])
  expect(herdrKindLaunch("cursor", "/tmp/project")).toEqual({ kind: "cursor", args: ["--workspace", "/tmp/project", "--trust"] })
  expect(herdrKindLaunch("claude", "/tmp/project")).toEqual({ kind: "claude", args: [] })
})

test("createHandover uses herdr tab pool + agent start --kind", async () => {
  const root = await mkdtemp("/tmp/herdr-handover-")
  const calls: string[][] = []
  const run = async (argv: string[]) => {
    calls.push(argv)
    if (argv[0] === "opencode" && argv[1] === "export") return { code: 0, stdout: '{"session":"exported"}' }
    if (argv[1] === "tab" && argv[2] === "list") {
      return { code: 0, stdout: JSON.stringify({ result: { tabs: [{ tab_id: "w:tH", workspace_id: "w", label: "opencode-herdr" }] } }) }
    }
    if (argv[1] === "pane" && argv[2] === "list") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            panes: [{ pane_id: "w:pSeed", tab_id: "w:tH", workspace_id: "w", terminal_id: "term-seed" }],
          },
        }),
      }
    }
    if (argv[1] === "pane" && argv[2] === "split") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: { pane: { pane_id: "pane_handover", terminal_id: "term_handover", tab_id: "w:tH" } },
        }),
      }
    }
    if (argv[1] === "agent" && argv[2] === "start") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            type: "agent_started",
            agent: { name: argv[3], terminal_id: "term_handover", pane_id: "pane_handover", agent_status: "idle" },
          },
        }),
      }
    }
    if (argv[1] === "agent" && argv[2] === "wait") return { code: 0, stdout: "{}" }
    if (argv[1] === "agent" && argv[2] === "prompt") return { code: 0, stdout: "{}" }
    return { code: 0, stdout: "{}" }
  }
  try {
    const result = await createHandover({
      sessionId: "ses_test",
      directory: root,
      workspace: "w",
      tab: "t",
      pane: "p",
      runtime: "cursor",
      note: "continue the handover work",
      stateDir: join(root, "state", "opencode-herdr"),
      run,
    })
    expect(result.runtime).toBe("cursor")
    expect(result.paneId).toBe("pane_handover")
    expect(result.prompt).toContain("Continue from an OpenCode handover.")
    const artifact = JSON.parse(await readFile(result.handoverPath, "utf8"))
    expect(artifact.destination.kind).toBe("cursor")
    expect(artifact.destination.tabId).toBe("w:tH")
    const startCall = calls.find((argv) => argv[1] === "agent" && argv[2] === "start")
    expect(startCall).toContain("--kind")
    expect(startCall).toContain("cursor")
    expect(startCall).toContain("--pane")
    expect(startCall).toContain("pane_handover")
    expect(startCall?.slice(startCall.indexOf("--") + 1)).toEqual(["--workspace", root, "--trust"])
    expect(calls.some((c) => c[1] === "pane" && c[2] === "split")).toBeTrue()
    expect(calls.some((c) => c[1] === "pane" && c[2] === "rename" && String(c[4] ?? "").startsWith(JOB_PANE_PREFIX))).toBeTrue()
    const waitIdx = calls.findIndex((argv) => argv[1] === "agent" && argv[2] === "wait")
    const promptIdx = calls.findIndex((argv) => argv[1] === "agent" && argv[2] === "prompt")
    expect(waitIdx).toBeGreaterThan(-1)
    expect(promptIdx).toBeGreaterThan(waitIdx)
    expect(calls[waitIdx]).toContain("--until")
    expect(calls[waitIdx]?.[3]).toBe("pane_handover")
    expect(calls[promptIdx]).toEqual(["herdr", "agent", "prompt", "pane_handover", result.prompt])
    expect(formatHandoverConfirmation(result)).toContain("Context prompt was sent")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("injectConfig registers herdr-handover command", () => {
  const config: any = {}
  injectConfig(config, [target], { cwd: "/tmp", workspace: "w", tab: "t", pane: "p" })
  expect(config.command["herdr-handover"].description).toContain("Hand over")
})

test("resolvePaneTarget accepts adapter or target id", () => {
  expect(resolvePaneTarget([target], "cursor").id).toBe(target.id)
  expect(resolvePaneTarget([target], target.id).id).toBe(target.id)
  expect(() => resolvePaneTarget([target], "claude")).toThrow("runtime unavailable")
})

test("parseHandoverArgs splits runtime and note", () => {
  expect(parseHandoverArgs("cursor extra work")).toEqual({ runtime: "cursor", note: "extra work" })
  expect(parseHandoverArgs("continue without runtime")).toEqual({ runtime: undefined, note: "continue without runtime" })
})

test("buildHandoverPrompt is a single line without Enter", () => {
  const prompt = buildHandoverPrompt({
    sessionId: "ses_1",
    directory: "/tmp/project",
    handoverPath: "/tmp/h.json",
    exportPath: "/tmp/e.json",
    note: "finish the refactor",
  })
  expect(prompt.includes("\n")).toBeFalse()
  expect(prompt).toContain("ses_1")
})

test("availableRuntimes filters by binary presence", () => {
  const names = availableRuntimes(["cursor", "nope-runtime" as any])
  expect(names.includes("nope-runtime" as any)).toBeFalse()
})
