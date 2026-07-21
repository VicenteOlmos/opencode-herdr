# Design: Add Herdr Provider Routing

## Technical Approach

Ship one Bun/TypeScript plugin/provider for OpenCode 1.18.4. `Hooks.config` injects `herdr` config before provider initialization; resolution imports `opencode-herdr` and calls `createHerdr().languageModel(id)`. Requests use a runner as a named Herdr agent in one owned, visible pane.

## Architecture Decisions

| Decision | Choice and rationale |
|---|---|
| Registration | `Hooks.config` runs before `cfg.provider` parsing in 1.18.4. Inject provider/models directly; fail on existing `herdr`/`herdr-pane`. |
| Package exports | Root exports exactly `HerdrPlugin: PluginModule = { id:"opencode-herdr", server }` and `createHerdr(options) → { languageModel(modelID): LanguageModelV3 }`. No other `create*`; OpenCode selects first such key. |
| Tool capability | Adapter contract determines delegated edit/run capability. Verified/known models from capable adapters publish `tool_call:true`; unknown models remain discovery-only. OpenCode V3 `tools`/`toolChoice` are filtered with warnings: delegated-agent tools are not OpenCode-native structured tool events. |
| Process boundary | Use `herdr agent start ... -- <argv...>`, never `pane run` or shell command text. Preserve private files, atomic result, pane visibility, exact routing, and owned cleanup. |

## Data Flow

Injected shape:

```ts
(config.provider ??= {}).herdr = {
  name: "Herdr", npm: "opencode-herdr",
  models: { [target.id]: {
    id: target.id, name: target.name,
    provider: { npm: "opencode-herdr", api: "herdr" },
    tool_call: true, modalities: { input: ["text"], output: ["text"] },
    limit: target.limits, status: "active",
    cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    options: { adapter: target.adapter, nativeModel: target.nativeModel, provenance: target.provenance }
  }}}
```

`config → provider/model npm → import → createHerdr → Target → private job → Herdr agent → native JSON(L) → atomic result → V3`

Require `HERDR_ENV=1` plus current workspace/tab IDs. Create 0700 job directory and 0600 request. Spawn Herdr with argv:

`herdr agent start <unique-name> --cwd <project> --workspace <current-workspace> --tab <current-tab> --split <right|down> --env OPENCODE_HERDR_JOB=<path> --no-focus -- <fixed-runner-argv...>`

Parse `{type:"agent_started",agent:{terminal_id,pane_id,...},argv}`; reject mismatched name/cwd/workspace/tab/argv. Target returned `terminal_id` with `agent get/read/send/wait`: wait idle, send fixed start token, wait working then idle; accept `done` from `get`. Runner uses fixed `Bun.spawn` argv, renames `result.tmp` atomically, and exposes sanitized progress. Abort sends fixed cancel control, waits, then closes only returned `pane_id`.

## File Changes

| File | Action | Description |
|---|---|---|
| `package.json`, `tsconfig.json` | Create | Bun exports/bin and pinned OpenCode/V3 contracts. |
| `src/index.ts`, `provider.ts`, `opencode-config.ts`, `command.ts` | Create | Plugin exports, exact provider injection, catalog, command/tools. |
| `src/language-model.ts`, `messages.ts`, `result.ts` | Create | V3 filtering and result adaptation. |
| `src/runner.ts`, `job.ts`, `herdr.ts`, `errors.ts`, `sanitize.ts` | Create | Agent lifecycle, private jobs, atomic results, cancellation. |
| `src/capabilities.ts`, `src/adapters/*.ts` | Create | Provenance catalog and native CLI adapters. |
| `test/*.test.ts`, `test/fixtures/**` | Create | Config/import, Herdr JSON, CLI JSONL, RED fixtures. |

## Interfaces / Contracts

`Target = { id; name; adapter; nativeModel; provenance:"verified"|"known"; limits; toolCall:true; toolMode:"delegated-agent" }`. No fallback. Known models must be confirmed by native output before work or hard-fail.

Atomic snapshot at `${XDG_STATE_HOME:-$HOME/.local/state}/opencode-herdr/capabilities-v1.json` records `verified|known|unknown`, sources, adapter version, limits, and delegated tools. `JobResultV1` carries IDs, status, text, verified usage, native finish, delegated-tool summary, and sanitized diagnostics. `doStream` emits synthetic start/metadata/text/finish only after validation; errors/cancellation never succeed.

Static `/herdr-pane` uses built-in `question`, `herdr_capabilities`, and `herdr_pane`; tools revalidate inputs.

## Testing Strategy

| Layer | RED coverage |
|---|---|
| Unit | Injected shape; verified+known listing; adapter-derived `tool_call`; native-tool filtering/no fabricated events; envelope/sanitation. |
| OpenCode contract | 1.18.4 hook-before-provider order; provider/model npm retention; dynamic import selects only `createHerdr`; factory receives provider name/options; `languageModel(api.id)` returns V3. |
| Herdr integration | Exact argv after `--`; unique name/current IDs/no-focus; parse terminal/pane IDs; get/read/send/wait order; malformed response, timeout, abort, owned close. |

## Threat Matrix

| Boundary | Applicability | Safe/failure behavior | Planned RED test |
|---|---|---|---|
| Documentation-like paths | N/A — no executable-file classification | None | None |
| Git repository selection | N/A — no Git routing | None | None |
| Commit state | N/A — no commits | None | None |
| Push state | N/A — no pushes | None | None |
| PR commands | N/A — no PR automation | None | None |
| Provider import/config | Applicable | Exact npm fields/exports; conflicts or malformed models fail | R1 missing npm/api/limits; wrong/extra `create*`; invalid V3 factory |
| Agent start/routing | Applicable | Fixed argv, current IDs, returned terminal/pane authority | R2 metachar/path injection; duplicate name; focused-pane trap; forged response |
| Tool/model filtering | Applicable | Adapter gates tools; known model confirms; native schemas/events filtered | R3 unavailable/substituted model; hostile tool history; fabricated tool event |
| Job/output/abort | Applicable | Private atomic files, bounded sanitation, owned cancellation | R4 symlink/partial result/ANSI/secret/oversize; abort each phase/foreign pane |

## Migration / Rollout

No migration or restart gate. Minimum supported OpenCode is 1.18.4, enforced by package compatibility and contract tests. Remove package from `plugin[]` to roll back.

## Open Questions

None.
