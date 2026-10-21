# Native execution engine with mandatory OpenCode integration
Objective: reduce per-job runtime and output-buffer overhead while retaining opencode-herdr as the OpenCode plugin. Baseline: `84db6dc` plus preserved pre-existing worktree edits; feature branch `feat/native-herdr-engine`.
Delivery: `ask-on-risk`, `feature-branch-chain` selected; estimated 600–800 authored changed lines, no remote publication authorized. Checks: `bun test`, local shell-engine subprocess tests, `bunx tsc --noEmit`, isolated synthetic memory comparison.

## Specs

### S1 — Implement the approved recommendation

> me gusta la recomendacion
> vamos con eso

Implement the previously recommended execution-engine separation and bounded output processing, subject to S2. Preserve the existing CLI adapter arguments, model/effort selection, provider result schema, commands, and job cleanup. An independent engine means an internal execution component without an extra Bun/OpenCode SDK runtime, not a replacement application. All implementation stays local; no installs, provider calls, active-session control, release, push, or PR creation are authorized by this document.

### S2 — Keep the OpenCode adapter mandatory

>  el adaptador de opencode es obligatorio
> Por algo el plugin se llama opencode-herdr

OpenCode remains the required product integration and consumes the engine's output. Do not make the OpenCode adapter optional, remove its existing capabilities, or introduce a separate primary standalone product.

### S3 — Reduce memory based on evidence

> algo que estoy pensando es que quizas cuando se usa herdr con otro cli 
> ocupa mucha memoria
> puedes investigar que forma podemos usar para que no use tanta memoria
> puede ser usar algo de herdr nativo para no depender de ts opencode

The completed investigation found full stdout/stderr retention and a Bun runner per task. Use existing Herdr pane execution with a lightweight on-demand execution component; parse adapter events incrementally in the already-running OpenCode host instead of keeping complete transcripts in RAM. Keep structured final results and bounded diagnostics. Document temporary-storage tradeoffs and any explicit bounds. Synthetic comparisons may quantify runner overhead only; do not claim measured end-to-end CLI savings without a controlled real-workload comparison.

## Tasks

- T1 [S1,S3] inline — verified: shared incremental adapter-output processing, bounded diagnostics, existing Bun-runner compatibility, regression tests and documentation; commit pending. Route reason: one dependent behavior, no writer trigger. Risk: item 3 (shared parser used by all existing adapters).
- T2 [S1,S2,S3] inline — pending: lightweight internal engine integrated into the existing controller, same argv helper/result writer, mandatory provider integration, native execution and cancellation/cleanup tests; commit pending. Route reason: depends on T1's parser and contract, not independent parallel work. Risk: items 2,3,4 (private capture files, shared execution contract, cancellation/lifecycle ordering).
- T3 [S1,S2,S3] inline + independent verification — pending: focused checks, applicable suite/typecheck, isolated synthetic memory comparison, named-risk verifier, structural readback and final findings; evidence pending. Route reason: parent owns checks, independent verifier required by T1/T2 named risks; long suites may use a bounded per-action worker.

## Log

### L1 — Original investigation request

algo que estoy pensando es que quizas cuando se usa herdr con otro cli 
ocupa mucha memoria
puedes investigar que forma podemos usar para que no use tanta memoria
puede ser usar algo de herdr nativo para no depender de ts opencode

### L2 — Implementation authorization

me gusta la recomendacion
vamos con eso

### L3 — Scope correction

 el adaptador de opencode es obligatorio
Por algo el plugin se llama opencode-herdr

### L4 — Initial evidence and implementation direction

- CodeGraph-first mapping and one controller spot check identify `HerdrController.execute` as the launch seam; retain `adapterArgv`, `createJob`, `writeResult`, `readResult`, pool ownership and terminal-state handling.
- Current checkout contains unrelated tracked edits and untracked TUI work. Preserve them; do not stage or commit them as part of this feature. New documentation will not overwrite the existing feature documents or dirty README.
- RDD is disabled globally; no native review or candidate consent should run. Functional and named-risk independent verification remain applicable.
- Prefer a small shell execution component shipped under `bin/` and existing Herdr pane control, rather than introducing a compiler, new runtime dependency, installer or platform release matrix. The mandatory OpenCode adapter owns structured parsing and sanitization. Retain the existing runner on unsupported platforms; document exact behavior after tests establish it.
- Pre-implementation memory snapshot is observational, not causal: Herdr total ~27.9 MiB PSS; five OpenCode processes total ~1290 MiB; one identified plugin Bun runner ~32.2 MiB. A different Bun process with a test command consumed ~4299 MiB and cannot be attributed to plugin runtime.
- Delivery strategy requires one chain selection before the first work-unit commit because forecast exceeds about 400 authored lines. No PR or remote action is authorized by that selection.
- Engram mirror locator: `odd/native-herdr-engine/tasks`.

### L5 — Delivery selection and baseline capture

- User selected `Cadena en feature (Recommended)` in the single-select delivery question. This authorizes local work-unit organization only, not publication.
- Created `feat/native-herdr-engine` without discarding or committing the pre-existing edits.
- Captured the starting source/tests/package into external scratch `/tmp/opencode/native-herdr-engine.JeG9Wf/base`; this is the differential baseline including existing user changes. Parent owns removal after verification.
- Slice 1: T1 incremental parsing and bounded diagnostics. Slice 2: T2 native execution integrated with mandatory OpenCode adapter. T3 verifies both together; no PRs created.

### L6 — T1 proof and bounded correction

- RED: `bun test test/adapter-output.test.ts` failed because the new parser module did not exist. GREEN: focused parser/phase6/effort checks passed 26 tests; workspace full suite passed 109 tests; TypeScript no-emit passed.
- External baseline differential checked four adapters across success, failure and malformed output: stdout, stderr, exit code, argv and persisted result matched in all 12 scenarios.
- Named-risk verifier found one regression: final unterminated stdout progress was skipped on nonzero CLI exit. Added `test/runner-eof.test.ts` and flushed pending lines before exit handling without replacing child diagnostics. Correction checks passed 17 tests and typecheck.
- One blocker-only independent recheck resolved the same EOF finding for all four adapters; request hashes and persisted results matched baseline. Cross-pipe message ordering is scheduling-dependent. Verifier did not run the new test file because it intentionally creates parent-owned temporary paths outside its own scratch; parent executed those tests successfully.
- Preserved verifier scratch: `/tmp/opencode/native-parser-verify.jeggew`, `/tmp/opencode/native-parser-recheck.wAQjVd`. Existing baseline tests create additional hardcoded `/tmp` paths; parent will remove only reported test-owned scratch paths after final verification.
- Relocated baseline initially lacked copied skills and failed a local-package path expectation; missing skills were copied into baseline. Actual workspace suite has zero failures; no unrelated code was changed to address snapshot-only failures.
