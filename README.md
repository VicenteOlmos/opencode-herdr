# opencode-herdr

[![npm](https://img.shields.io/npm/v/opencode-herdr.svg)](https://www.npmjs.com/package/opencode-herdr)
[![license](https://img.shields.io/npm/l/opencode-herdr.svg)](./LICENSE)
[![GitHub](https://img.shields.io/badge/github-VicenteOlmos%2Fopencode-herdr-181717?logo=github)](https://github.com/VicenteOlmos/opencode-herdr)

OpenCode plugin: route selected agents through [Herdr](https://herdr.dev) as `herdr/<adapter>/<nativeModel>` (runtime + model from the id).

Requires Herdr and at least one runtime CLI on `PATH` (`agent`, `claude`, `codex`, or `opencode`).

**Find it:** [npm](https://www.npmjs.com/package/opencode-herdr) · search `opencode herdr` · GitHub topics `opencode` `herdr`

## Install

```bash
opencode plugin opencode-herdr -g
```

Or in `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    ["opencode-herdr", { "handoverDefault": "cursor" }]
  ]
}
```

`handoverDefault` is optional. The plugin injects the provider entrypoint as a `file://` URL so OpenCode can load `createHerdr` even when the project cwd has no local `node_modules` link.

## Tested runtimes

| Runtime | CLI |
| --- | --- |
| Cursor | `agent` |
| Claude Code | `claude` |
| Codex | `codex` |
| OpenCode | `opencode` |

## Usage

| Command | Description |
| --- | --- |
| `/herdr-status` | Herdr availability, runtimes, and target count |
| `/herdr-test` | Create pane, ask agent a random sum, read the answer back into this chat |
| `/herdr-delete` | Close all `oh-*` job panes in the `opencode-herdr` tab |
| `/herdr-pane <runtime> <task>` | Delegate a task (asks if runtime/task missing) |
| `/herdr-handover <runtime> [note]` | Split pane, wait idle, send one-line context |

CLI (no LLM):

```bash
opencode-herdr-handover --runtime cursor --session <id> --cwd <path>
```

On each new OpenCode session the plugin shows a readiness toast. The bundled Herdr skill is installed idempotently to `~/.config/opencode/skills/herdr/SKILL.md` on config load.

## Model refs

Configure an agent with e.g. `herdr/cursor/composer-2.5` → provider `herdr`, runtime **cursor**, model **composer-2.5**.

## Dev / debug

Path plugin (local checkout):

```json
{
  "plugin": [[
    "/absolute/path/to/opencode-herdr/src/index.ts",
    { "handoverDefault": "cursor", "debug": true }
  ]]
}
```

| Option | Effect |
| --- | --- |
| `keepPanes` | Do not close `oh-*` panes after a job (inspect `[herdr]` runner logs) |
| `keepJobs` | Keep `/tmp/.opencode-herdr-*` (`request.json` / `result.json`) |
| `debug` | Implies `keepPanes` + `keepJobs` |

Env: `OPENCODE_HERDR_DEBUG=1`, `OPENCODE_HERDR_KEEP_PANES=1`, `OPENCODE_HERDR_KEEP_JOBS=1`.

Close leftovers with `/herdr-delete`.

```bash
bun install && bun test
```

## License

MIT
