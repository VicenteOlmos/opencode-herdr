# herdr-handover Specification

## Purpose
Mechanically hand over an OpenCode session context to a Herdr-managed interactive runtime pane, then send a context prompt into that pane without OpenCode LLM task delegation.

## Requirements

### Requirement: Runtime selection
The handover MUST accept an explicit runtime/CLI identifier validated against discovered available adapters. If the runtime argument is omitted, a configured default MAY be used. If neither is present, handover MUST fail with an actionable error listing available runtimes.

#### Scenario: Explicit runtime
- GIVEN `/herdr-handover claude` or CLI `--runtime claude`
- WHEN handover executes
- THEN Claude interactive argv is used and a context prompt is sent after idle

#### Scenario: Missing runtime
- GIVEN no runtime argument and no configured default
- WHEN handover executes
- THEN it fails listing available runtimes

### Requirement: Artifact and env injection
The handover MUST write `opencode-herdr.handover/v1` JSON under state dir (including the sent prompt text) and pass `OPENCODE_HERDR_HANDOVER` to the started agent. Session export is best-effort and non-fatal.

#### Scenario: Artifact written
- GIVEN a valid session id and directory
- WHEN handover executes
- THEN artifact contains source session/directory, destination adapter argv, and prompt

### Requirement: Interactive right-split start with context send
The handover MUST start `herdr agent start` with `--split right --no-focus`, wait until the destination is idle, then call `herdr agent send` with a context prompt that references the handover artifact and optional session export. It MUST NOT call `pane run` or `herdr_pane`.

#### Scenario: Context delivered
- GIVEN handover succeeds
- WHEN destination pane opens and reaches idle
- THEN a single-line context prompt is injected via `agent send` (no Enter/newline keypresses) so the destination can continue from the OpenCode session

### Requirement: No source-session submit
Slash `/herdr-handover` MUST complete mechanically in `command.execute.before` and MUST abort before OpenCode creates a user message or LLM turn in the source session (no Enter/submit).

#### Scenario: Source session stays idle
- GIVEN `/herdr-handover cursor` succeeds
- WHEN the command finishes
- THEN the source OpenCode session does not start an LLM loop for the command template

### Requirement: Invocation surfaces
CLI `opencode-herdr-handover` and slash `/herdr-handover` MUST call the same mechanical handover function via `command.execute.before`.
