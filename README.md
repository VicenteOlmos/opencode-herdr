# opencode-herdr

> **V2 migration status:** This branch targets the published OpenCode 2.0 beta contracts. Native server loading, provider/model catalog registration, concurrent fake-adapter generation, native TUI setup/callbacks/feedback/cleanup, and clean tarball installation (including the npm launcher and automatic companion discovery) are verified against beta `0.0.0-beta-17823`. Compatibility is scoped to that runtime. Physical keyboard input, real provider generation, and the default runtime package downloader remain unverified. These V2 changes are not published yet.

[![npm](https://img.shields.io/npm/v/opencode-herdr.svg)](https://www.npmjs.com/package/opencode-herdr)
[![license](https://img.shields.io/npm/l/opencode-herdr.svg)](./LICENSE)
[![GitHub](https://img.shields.io/badge/github-VicenteOlmos%2Fopencode-herdr-181717?logo=github)](https://github.com/VicenteOlmos/opencode-herdr)

OpenCode plugin: route selected agents through [Herdr](https://herdr.dev) as `herdr/<adapter>/<nativeModel>` (runtime + model from the id).

Requires Herdr and at least one runtime CLI on `PATH` (`agent`, `claude`, `codex`, or `opencode`).
This branch uses the beta `@opencode-ai/plugin` contract and requires the matching `@opencode-ai/cli@0.0.0-beta-17823` runtime (`opencode2`). It does not target the stable `@opencode/plugin` package.

**Find it:** [npm](https://www.npmjs.com/package/opencode-herdr) · search `opencode herdr` · GitHub topics `opencode` `herdr`

## Install

Add the package to `plugins` in `~/.config/opencode/opencode.json`:

```json
{
  "plugins": [
    { "package": "opencode-herdr", "options": { "handoverDefault": "cursor" } }
  ]
}
```

`handoverDefault` is optional. The server plugin registers Herdr providers, models, tools, and agent routing through the beta catalog API. Mechanical `/herdr-*` commands are callbacks in the `./tui` companion and execute on the local TUI host; they are not server commands and are not prompt templates. Remote/server-only clients do not receive those local callbacks. The server smoke verifies plugin activation and the beta registry's `tui: true` companion declaration, but does not verify interactive TUI rendering or command discovery.

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
| `/herdr-pane <runtime> <task>` | Delegate a task (shows usage if runtime/task is missing) |
| `/herdr-handover <runtime> [note]` | Split pane, wait idle, send one-line context |

CLI (no LLM):

```bash
opencode-herdr-handover --runtime cursor --session <id> --cwd <path>
```

Mechanical command results are sent as no-reply synthetic session messages with `resume: false`, so reporting a result does not start another model turn. Command execution requires Herdr and the selected runtime to be available on the local TUI host. The bundled Herdr skill is installed idempotently to `~/.config/opencode/skills/herdr/SKILL.md` during plugin setup.

## Model refs

Configure an agent with e.g. `herdr/cursor/composer-2.5` → provider `herdr`, runtime **cursor**, model **composer-2.5**.

## Dev / debug

Path plugin (local checkout):

```json
{
  "plugins": [{
    "package": "/absolute/path/to/opencode-herdr/src/index.ts",
    "options": { "handoverDefault": "cursor", "debug": true }
  }]
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

Run the opt-in beta native loader smoke with `bun run smoke:v2`. It installs the pinned published beta CLI into an isolated temporary home, uses fake runtime CLIs, and never calls a model provider. Set `OPENCODE_V2_BIN` to an existing matching `opencode2` binary to skip the package download.

## License

MIT
