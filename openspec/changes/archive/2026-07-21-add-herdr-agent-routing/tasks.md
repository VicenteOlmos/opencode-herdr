# Tasks: Add Herdr Provider Routing

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated lines | 900–1,300 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Split | PR 1 contracts; PR 2 runner; PR 3 provider; PR 4 docs |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Contracts/discovery | PR 1 | `bun test test/contracts.test.ts test/capabilities.test.ts` | Fake CLIs | Remove catalog |
| 2 | Jobs/terminal lifecycle | PR 2 | `bun test test/job.test.ts test/herdr.test.ts` | Fake Herdr agent API | Remove runner |
| 3 | Provider/V3/tools | PR 3 | `bun test test/provider.test.ts test/language-model.test.ts` | Fake Herdr request | Remove provider surface |
| 4 | Threat tests/docs/harness | PR 4 | `bun test` | `bun run smoke` | Revert docs/harness |

## Phase 1: Contracts and Discovery

- [x] 1.1 RED: pin Bun/TypeScript, plugin, and AI SDK V3 contracts; test `Target`, `JobResultV1`, exact IDs, no fallback.
- [x] 1.2 GREEN: create package/config, adapter types, errors, sanitizer.
- [x] 1.3 RED R1: non-tool adapter/model excluded from `tool_call`; GREEN `src/capabilities.ts` and four adapter files parse documented outputs only.
- [x] 1.4 RED: provenance, atomic versioned snapshot, stale/invalid snapshot; GREEN discovery and `capabilities-v1.json` publication.
- [x] 1.5 RED: arbitrary `cfg.provider.herdr`, `model.api` `npm`, dynamic import, `createHerdr().languageModel(id)`; GREEN `src/index.ts`/`src/provider.ts` inject config.

## Phase 2: Jobs and Terminals

- [x] 2.1 RED R4: metacharacters, traversal, symlink, owner/mode, partial result; GREEN `src/job.ts`, `src/runner.ts` use private files, `herdr agent start ... -- <argv...>`, schema validation, atomic rename.
- [x] 2.2 RED R5: fake/mismatched IDs, timeout, wrong state order, focus trap; GREEN `src/herdr.ts` uses `agent get/read/send/wait`, returned IDs, ordered state, cleanup.
- [x] 2.3 RED R6: ANSI/control, secret/path leakage, oversize output; GREEN bounded sanitization.
- [x] 2.4 RED R7: abort before/during/after work and foreign terminal/pane; GREEN cancellation uses `agent send`, waits via `agent wait`, and cleans only returned owned IDs.

## Phase 3: Provider and UX

- [x] 3.1 RED R2: unavailable/substituted model; GREEN `src/provider.ts` exact `herdr/<stable-id>` routing and accurate limits/status/provenance.
- [x] 3.2 RED R3: hostile tool schema/history; GREEN `src/language-model.ts`, `messages.ts`, `result.ts` filter native tools and emit no fabricated tool events.
- [x] 3.3 RED: text, synthetic stream, usage, finish/error, cancellation; GREEN V3 generation and delegated `tool_call` metadata.
- [x] 3.4 GREEN `src/command.ts` adds prompted/direct `/herdr-pane`, capability and pane tools with placeholder revalidation; all delegation uses agent argv, never shell strings.

## Phase 4: Verify and Docs

- [x] 4.1 Add contract fixtures and integration tests in `test/` for provider injection/factory, agent argv, model confirmation, JSON/JSONL, returned IDs, get/read/send/wait order, cleanup, and all R1–R7.
- [x] 4.2 Add `bun run smoke` harness using fake Herdr/CLIs; document install, config, targets, provenance, tools, cancellation, rollback.
- [x] 4.3 Run `bun test`, `bunx tsc --noEmit`, smoke; verify no substitutions or unsupported claims.

## Apply Evidence

| Work unit | Focused test result | Runtime harness | Rollback boundary |
|---|---|---|---|
| 1 Contracts/discovery | `bun test test/contracts.test.ts test/capabilities.test.ts` — 5 pass | Fake CLI callback; no paid calls | Remove package, catalog, adapters |
| 2 Jobs/terminals | `bun test test/job.test.ts test/herdr.test.ts` — 6 pass | `bun run smoke` — fake `agent` binary passed | Remove job, runner, Herdr lifecycle files |
| 3 Provider/V3 | `bun test test/provider.test.ts test/language-model.test.ts` — 4 pass | Fake request/result executor; no network | Remove provider, config, V3 files |
| 4 Full verification/docs | `bun test` — 15 pass; `bunx tsc --noEmit` — exit 0 | `bun run smoke` — fake Herdr/agent runtime passed | Remove README and smoke harness |

## Phase 5: Pending Runtime Remediation

- [x] 5.1 RED: selected model lacks executor; GREEN wire `createHerdr().languageModel` to Herdr controller/job result and safe OpenCode runtime.
- [x] 5.2 RED: tools/flows absent; GREEN register `herdr_capabilities`, `herdr_pane`, and complete prompted/direct `/herdr-pane`.
- [x] 5.3 RED: production bypasses Herdr; GREEN connect `agent start/get/read/send/wait`, returned IDs, abort, owned cleanup.
- [x] 5.4 RED: tools overclaimed; GREEN derive `tool_call` from adapters and emit structured metadata/results only when supported.
- [x] 5.5 RED: stale refresh/missing Herdr; GREEN retain/mark stale snapshots, timeout diagnostics, known-model confirmation.
- [x] 5.6 RED: missing error, abort, input, threat, OpenCode scenarios; GREEN add runtime tests for external errors, abort, symlink/mode/target mismatch, R1–R7, safe load.

### Phase 5 Apply Evidence

| Task | Evidence | State |
|---|---|---|
| 5.1 | Config injects validated directory/workspace/tab/pane directly into provider options; `createHerdr` consumes controller context. | Passed |
| 5.2 | Plugin tools and static command template are registered; template uses supported built-in `question` orchestration and tool input revalidates. | Passed |
| 5.3 | Fake Herdr smoke proves `start → wait → send → wait → wait → get → read → close` with returned IDs. | Passed |
| 5.4 | Documented full-agent adapters advertise delegated `tool_call:true`; V3 filters native schemas/events and returns final text. | Passed |
| 5.5 | Atomic stale retention and timeout-to-sanitized-unknown tests pass; discovered output is verified, so no unconfirmed known target is advertised. | Passed |
| 5.6 | Focused 15-pass suite covers context, lifecycle, tools, abort/error, timeout, symlink/mode/target validation; isolated fake OpenCode config load passed. | Passed |

## Phase 6: Pending Verified Gaps

- [x] 6.1 RED: real `herdr agent start` runner produces no result; GREEN add executable `src/runner.ts` CLI entry that reads job input and atomically writes validated result.
- [x] 6.2 RED: sanitized model IDs collide and limits are fixed; GREEN make stable IDs collision-proof and source limits from adapter discovery.
- [x] 6.3 RED: `nativeFinish` is lost; GREEN map supported native finish reasons into `LanguageModelV3` finish output.
- [x] 6.4 RED: plugin load and `herdr_capabilities` omit snapshot; GREEN wire `refreshSnapshot` into config load and capability tool.
- [x] 6.5 RED: ignored `agent get` status/authority; GREEN validate returned terminal/pane ownership and status before accepting results.
- [x] 6.6 RED: cancellation closes immediately; GREEN wait for agent termination after send, then close only owned resources.
- [x] 6.7 RED: smoke injects result callback and command flows lack runtime proof; GREEN run real runner path and add deterministic no/partial/direct command-tool tests plus best available command harness.

### Phase 6 Apply Evidence

| Task | Evidence | State |
|---|---|---|
| 6.1 | `test/phase6.test.ts` launches real `src/runner.ts` through a fake `agent`; it writes and validates `result.json` atomically. | Passed |

## Phase 7: Pending Final Remediation

- [x] 7.1 RED: `doStream()` omits required AI SDK V3 `response-metadata`; GREEN emit ordered response metadata between stream start and text parts.
- [x] 7.2 RED: missing Herdr with prior snapshot exposes stale executables; GREEN retain stale diagnostics but publish zero executable targets/models and hard-fail capability/delegation tools.
| 6.2 | Collision test distinguishes `a/b` and `a-b`; discovery test propagates discovered `{ context: 321, output: 123 }` limits. | Passed |
| 6.3 | V3 generation maps native `length` to `{ unified: "length", raw: "length" }`. | Passed |
| 6.4 | Fake-binary plugin config and capability-tool paths publish `capabilities-v1.json` in isolated `XDG_STATE_HOME`. | Passed |
| 6.5 | `agent get` rejects mismatched terminal/pane responses and controller requires `done` before reading result. | Passed |
| 6.6 | Cancellation test proves `send → wait idle → close` ordering for owned resources. | Passed |
| 6.7 | Smoke uses actual runner/result file with fake binaries; deterministic command-template and direct-tool tests cover no/partial/direct argument handling. | Passed |

### Phase 7 Apply Evidence

| Task | Evidence | State |
|---|---|---|
| 7.1 | RED test failed without `response-metadata`; GREEN `bun test test/language-model.test.ts test/capabilities.test.ts` — 7 pass, 18 assertions proves `stream-start → response-metadata → text-start → text-delta → text-end → finish`. | Passed |
| 7.2 | RED test failed with stale `herdr:true`; GREEN focused test proves stale diagnostics/runtimes remain while `herdr:false`, executable targets/models are empty, tools and provider reject unavailable. Isolated fake-binary OpenCode reload confirms empty models after prior snapshot. | Passed |
