# Native execution engine with mandatory OpenCode integration
Objective: reduce per-job runtime and output-buffer overhead while retaining opencode-herdr as the OpenCode plugin. Original baseline: `84db6dc` plus preserved worktree edits; clean PR base: `261ed99` (`main`), branch `feat/native-herdr-engine-pr`.
Delivery: user-authorized `single-pr`, replacing the earlier chain with an explicit size exception; scoped Git HTTPS push and GitHub CLI PR creation authorized for VicenteOlmos/opencode-herdr. Checks: `bun test`, typecheck, shell syntax, fake-runtime smoke, controlled memory evidence; no merge or release.

## Specs

### S1 — Implement the approved recommendation

> me gusta la recomendacion
> vamos con eso

Implement the previously recommended execution-engine separation and bounded output processing, subject to S2. Preserve the existing CLI adapter arguments, model/effort selection, provider result schema, commands, and job cleanup. An independent engine means an internal execution component without an extra Bun/OpenCode SDK runtime, not a replacement application. Initial implementation authorization excluded remote actions; S4 records the later scoped publication authorization. Real provider calls, active-session control, merge and release remain out of scope.

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

> quiero que midas el ahorro

User reopened reliable memory measurement after the earlier deferral. Run a fresh bounded, controlled comparison of the original runner, optimized Bun backend, and native backend with identical synthetic CLI output and mandatory provider consumption. Report process-tree PSS, workload, repetitions, result equivalence and limitations; do not extrapolate measured executor savings to total OpenCode memory. No real provider or active Herdr session is authorized by this measurement request.

### S4 — Prepare the clean, authorized pull request

> dale pr

> PR limpio único

Use a fresh branch from current `main` containing only the three memory feature commits, preserving the original branch and all pending user changes. The user explicitly replaced the earlier chain with one over-budget PR and selected this repository's current template and rules without requiring an approved issue or new labels. Authorized destination: `github.com/VicenteOlmos/opencode-herdr`; push `feat/native-herdr-engine-pr` using configured Git HTTPS authentication and create its PR using the authorized existing GitHub CLI session. Check compatibility on the clean base; do not include the two earlier V2 migration commits, merge, release, force-push, or change credential settings.

### S5 — Fix the confirmed inherited-writer regression

> dale con ese fix entonces

Fix Pullfrog's confirmed PR #34 finding: native completion must wait for EOF from inherited stdout and stderr writers, not merely the direct CLI exit. Preserve the CLI's actual exit code, cancellation/deadline behavior, private capture permissions and bounded-memory streaming; do not add a fixed sleep or another JS runtime. Add delayed-writer native/Bun parity coverage and include the correction in the same authorized PR. Keep the already prepared CI fixture portability correction. Do not merge, release, resolve review threads or trigger Pullfrog's automated fix actions.

## Tasks

- T1 [S1,S3] inline — verified: shared incremental adapter-output processing, bounded diagnostics, existing Bun-runner compatibility, regression tests and documentation; commit `34c8ec3`. Route reason: one dependent behavior, no writer trigger. Risk: item 3 (shared parser used by all existing adapters).
- T2 [S1,S2,S3] inline — verified: lightweight internal engine integrated into the existing controller, same argv helper/result writer, mandatory provider integration, native execution and cancellation/cleanup tests; commit `ed42d7e`. Route reason: depends on T1's parser and contract, not independent parallel work. Risk: items 2,3,4 (private capture files, shared execution contract, cancellation/lifecycle ordering).
- T3 [S1,S2,S3] inline + bounded measurement worker — verified: functional checks, suite/typecheck, named-risk verifier and package contents passed; nine valid controlled process-tree memory runs recorded in `odd/evidence/native-herdr-engine-memory.json`; source commits `34c8ec3`, `ed42d7e`. Route reason: a per-action worker prepared the synthetic benchmark; parent corrected the isolated PATH and ran the bounded batch. Existing shipping source remains unchanged.
- T4 [S4] inline — PR #34 created and read back; required CI fixture correction passes all 41 affected cases and typecheck locally, target-host CI recheck pending. Clean-base cherry-picks `0744f15`, `727b11a`, `1e9e613` and preparation `353c892` are published on `feat/native-herdr-engine-pr`; initial local 171-test/typecheck/smoke/syntax checks passed. Route reason: understood Git/metadata work and one test-only CI correction; no writer trigger. Shipping executable source remains unchanged.
- T5 [S1,S5] delegated direct — pending: inherited-writer EOF completion, parity/privacy/lifecycle regressions and documentation; commit pending. Writer reason: advisory long-session context backstop after repeated specification and investigation payloads; one bounded coherent unit, no parallel writer. Risk: items 2,3,4 (private FIFOs/captures, shared completion contract and asynchronous writer/relay ordering). Own focused/full checks then one independent verifier before publication; RDD remains off.

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

### L7 — First local work unit

- T1 committed as `34c8ec3`, 394 authored added/deleted lines including specification, tests and docs. No existing user changes were staged. RDD remains disabled; no assessment/review was started.
- `git diff --cached --check` reported two trailing spaces inside verbatim user-request quotations in this document. They are intentionally preserved rather than rewriting the user's exact request; source checks are clean.

### L8 — T2 implementation and local evidence

- RED: `bun test test/native-execution.test.ts` failed because `src/execution.ts` did not exist. Native integration now passes 10 focused tests, 127 full-suite tests, TypeScript no-emit and the fake-runtime tab-pool smoke.
- Engine uses existing Herdr pane execution and the system shell; no compiler or extra resident JS runtime. OpenCode remains required, owns parsing and uses existing `adapterArgv`, `writeResult`, `readResult` and cleanup. Bun remains available as explicit compatibility backend and on unsupported platforms.
- Existing Herdr terminal-input guards reject multiline arguments. To preserve multiline tasks without weakening those guards, generated `command.sh` is mode 0600 and quotes each argv value as a shell literal. It is not sent to terminal input. Original target/model control-character validation remains intact.
- Native output uses private temporary files instead of transcript RAM. Native pane progress is start/finish; the Bun compatibility backend retains per-event progress. Raw captures retained by `keepJobs` may be sensitive. These tradeoffs were disclosed and documented.
- First synthetic benchmark attempt timed out because its harness supplied an Adapter descriptor where a Target was required. No memory result was obtained or claimed. One bounded harness correction is pending; no live CLI/provider workloads are authorized.

### L9 — T2 correction and final functional proof

- Independent verification found one compatibility regression: an uncancelled native CLI exit 130/143 was classified as cancelled instead of the baseline error. Fixed the classification; AbortSignal remains the authority for OpenCode cancellation. Committed regression probes cover all four adapters, provider result consumption, capture privacy, byte preservation and explicit limits.
- Blocker-only independent recheck: 12 exit-classification tests passed; 24 baseline/Bun/native executions across four adapters and exits 130/143 matched persisted error results. Independent earlier lifecycle probes confirmed fake CLI and sleep descendant are gone after cancellation/timeout without cleanup kills masking the result.
- Final workspace functional suite: 150 passed, zero failed; TypeScript no-emit, shell syntax, fake-runtime tab-pool smoke and npm dry-run artifact inclusion checks passed. Native-only tests skip on Windows; no real Windows or active Herdr session was tested, and no real provider was called.
- One corrected synthetic benchmark produced the same final response and argv in all three fresh hosts, but exited 1 during harness cleanup (`ChildProcess.exited` does not exist). Sampled tree PSS: baseline 148743 KiB, current Bun 98098 KiB, native 83472 KiB, 8–11 samples at nominal 15 ms for about 32 MiB JSONL output. These are provisional observations, not a validated benchmark or an end-to-end memory-saving claim. No further benchmark retry is authorized by the exhausted bounded correction.
- T3 needs one decision: accept functional completion without a quantified RAM-saving claim, or leave reliable memory measurement pending. Native code verification has no remaining reproduced blocker.

### L10 — Second local work unit and preservation checks

- T2 committed as `ed42d7e`, 438 authored added/deleted lines including integration, tests and docs. This coherent unit keeps its required provider integration and regression proofs together rather than splitting them to meet the advisory size heuristic. Cumulative local feature count: 832 lines, feature-branch-chain strategy retained; no PR, push or release.
- Verified original tracked edit patches and original untracked source/test bytes against the initial snapshot. Staged only the new README execution section; all prior README edits remain unstaged. Other user work remains unchanged.
- Read-only check found zero remaining processes matching benchmark scratch/executor paths. This resolves immediate cleanup concern but does not turn the failed benchmark command into a successful validated measurement. No additional benchmark run occurred.

### L11 — User defers measurement

Dejar medición pendiente

- User selected this option in the repeated single-select closure question. T3 remains open; reliable RAM savings are not validated. Do not execute further verification now.
- Preserve `/tmp/opencode/native-herdr-engine.JeG9Wf` and `/tmp/opencode/native-memory-bench.hELlA4` for the next explicitly authorized measurement task. Other explicitly reported verifier/test scratch directories were removed before this choice.
- T1/T2 implementation and local commits remain intact. No PR, push or release was authorized or performed.

### L12 — User reopens measurement

quiero que midas el ahorro

- This new request supersedes the earlier pause for T3 only. Run one fresh measurement batch with corrected Node child-process lifecycle handling, identical workloads and fresh hosts, three repetitions of each backend, and checked final results/argv/exit codes.
- Preserve the previous failed harness as historical evidence; author the new bounded harness in external scratch. Do not modify shipping code or use real providers/active Herdr sessions. Quantify executor process-tree PSS only and disclose sampling/disk-cache limitations.

### L13 — Validated controlled memory comparison

- The new worker attempt stopped before its first workload because its private PATH omitted Bun. Parent corrected the bounded harness to expose only the fake agent and required Bun/sh/ln/rm executables, assert clean executor exits, and check every observed owned PID is gone. No shipping source changed.
- Executed one fresh nine-case batch in `/tmp/opencode/native-memory-validated.JQjPh9`: three repetitions per backend with rotated order and identical fresh mandatory-provider hosts. Every host and executor exited 0, returned `BENCH_FINAL_RESULT`, received identical argv and emitted exactly 33,555,948 bytes. Each case supplied 120–140 PSS samples; median actual intervals were 20.23–22.30 ms.
- Median per-run time-weighted tree PSS: original 84.80 MiB; optimized Bun 70.23 MiB; native 41.18 MiB. Native reduction: 51.44% against original and 41.37% against optimized Bun in this paced synthetic workload.
- Median sampled peak tree PSS: original 131.37 MiB; optimized Bun 77.95 MiB; native 79.17 MiB. Native peak reduction against original: 39.74%. Native did not improve peak against optimized Bun (median 1.56% higher; ranges overlap). Do not claim an additional native peak benefit.
- Evidence includes all nine cases, observed ranges, method, exit/result/argv checks and raw-results SHA-256 in `odd/evidence/native-herdr-engine-memory.json`. These are executor-tree measurements, not total OpenCode UI/service memory, real-provider savings, whole-system RAM or reclaimable disk cache. OpenCode remains mandatory.
- Prior partial runs remain historical failures, not proof; this fresh batch supplies the requested comparison. All planned implementation and proportional checks are now complete. No PR, push or release was performed.

### L14 — Evidence retained, scratch removed

- Read back the evidence JSON against all nine raw cases: rounded peaks/means, argv, workload bytes, exit statuses and raw-results digest matched. All four remaining owned benchmark/baseline scratch roots were then removed. Durable numeric proof and limitations remain in `odd/evidence/native-herdr-engine-memory.json`.
- T1–T3 are verified. No additional source change or functional test-suite rerun was needed for the measurement-only closure. Existing user work remains outside the local feature commits.

### L15 — PR authorization and clean-base preparation

dale pr

PR limpio único

- User authorized the existing GitHub CLI session for this repository, then explicitly authorized a clean single PR, the new branch's Git HTTPS push and GitHub CLI creation. This supersedes the earlier chain choice and waives the global issue-first/new-label workflow for this PR in favor of the actual repository policy. The scope includes neither merge nor release.
- Target-host inspection found `main` diverged from the original feature branch, which would include two previous V2 migration commits. Prepared a separate home-directory worktree and cherry-picked only the three memory commits onto `261ed99`; original branch and dirty worktree remain intact.
- Resolved one README-only conflict by keeping both the current main beta-smoke paragraph and the new execution-memory section. No executable source change was required.
- Current main ruleset requires signed commits, linear history, resolved review threads and CI context `test`. The actual PR template is Summary, Checklist and Test plan; no issue forms or type-label catalog exist. User explicitly accepted one larger PR without creating new issue/label infrastructure.
- New branch dependency declarations and `bun.lock` exactly match the already-installed original workspace. Reuse those dependency files read-only rather than downloading or changing packages. Signature headers are present on all three cherry-picked commits; GitHub verification still requires target-host readback after push.

### L16 — Clean-base compatibility checks

- Resumed interrupted PR preparation without repeating the completed cherry-picks. Linked the matching installed dependencies read-only in the isolated worktree; no install or dependency change was required.
- `bun test`: 171 passed, zero failed, 23 files. `bun run typecheck`, `bun run scripts/smoke.ts` and `/bin/sh -n bin/opencode-herdr-engine`: exit 0 each. The smoke uses fake runtime CLIs and does not call a model provider.
- These results supersede the earlier 150-test worktree count for current PR compatibility, not the historical nine-run memory experiment. The benchmark's recorded source identifiers remain its original measured revisions.

### L17 — PR created; CI fixture portability correction

- Created `https://github.com/VicenteOlmos/opencode-herdr/pull/34`, `feat/native-herdr-engine-pr` into `main`. Readback confirmed exact title/body/branches/head. GitHub verified all four commit signatures. No unrelated migration commits or new issue/label infrastructure were included.
- Required GitHub CI `test` observed RED: 130 passed, 41 failed, all 41 errors were `ENOENT` while creating fixtures under `/tmp/opencode`, which exists in the coding environment but not on a clean Actions runner. This is a newly added test-fixture defect, not a shipping-engine behavior change.
- One correction batch replaces the hardcoded parent in the three new filesystem test files with `node:os.tmpdir()`. Keep all assertions and executable source intact; recheck the 41 affected cases under an isolated `TMPDIR`, typecheck, then publish the correction and let required CI re-run the full suite.
- Local GREEN: all 41 affected tests passed under a separate existing `TMPDIR`; zero fixture entries remained afterward. Typecheck passed. This correction changes only test fixture locations, not runtime logic, assertions, workflow configuration or dependencies. Required target-host CI will supply the full-suite recheck.

### L18 — Pullfrog finding validated and fix authorized

dale con ese fix entonces

- Read-only review of Pullfrog discussion `4341052696` confirmed a real default-native regression. With the same fake CLI/argv and a one-second inherited stdout writer, native returned `invalid adapter output` in 8 ms and kept its error result after valid output arrived; Bun waited 1017 ms and returned `late final`. Both direct CLI exits were 0 and request bytes matched; non-delayed controls passed.
- User now authorizes the fix. Use bounded POSIX output relays with genuine EOF completion rather than fixed delays or transcript buffering, preserving existing exit-status and controller cancellation/deadline semantics. Extra relay processes must be documented; earlier memory figures remain tied to their recorded source revisions until remeasured.
- Parent owns tracking, Git and PR publication. A bounded writer owns only engine, new EOF regression tests and execution-memory docs; it must not alter the existing CI portability changes or the original dirty workspace. No review-thread mutation is authorized.
