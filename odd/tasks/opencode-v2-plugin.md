# OpenCode V2 plugin compatibility

## Objective

Run opencode-herdr as a native OpenCode V2 plugin while preserving Herdr model routing, tools, handover, and user-facing feedback.

## Problem and rationale

The current entrypoint uses the OpenCode V1 Plugin/PluginModule contract and returned hooks. OpenCode V2 requires a new plugin contract and setup-time domain registrations. SDK `/v2` alone does not provide product V2 compatibility.

## Authorized scope and constraints

- User explicitly requested using this plugin with OpenCode V2.
- Migrate to the published `@opencode/plugin` API; verify package versions and installed declarations before implementation.
- Preserve model discovery, routing effort, handover lifecycle, commands, debug options, and provider behavior.
- Preserve visible handover feedback without accidentally starting another model turn. Investigate V2 synthetic-message semantics before selecting an implementation.
- Move terminal notifications to a companion CLI/TUI plugin when required by V2.
- No remote execution, publishing, push, PR creation, merge, global configuration changes, or changes to untracked `.engram/`.
- English artifacts; Conventional Commits without AI attribution.
- Receipt-driven development is OFF, decided by global preference. Do not enable or start native review.

## Delivery and recovery

- Branch: `feat/opencode-v2-plugin`.
- Branch point / initial review boundary: `0881d41`.
- Delivery strategy: `ask-on-risk`.
- Forecast: 450–700 authored changed lines, excluding generated lockfiles.
- Running committed authored count: 0 implementation lines (tracking commit `f845e9f`: 65 lines).
- Chain strategy: `feature-branch-chain`, explicitly selected by user (option 1).
- Planned slices: tracker `feat/opencode-v2-plugin`; OCV2-1 branch `feat/opencode-v2-01-server` targets tracker; OCV2-2 branch `feat/opencode-v2-02-feedback` targets OCV2-1. No remote PR operation is authorized.
- Server slice `size:exception`: explicitly accepted by user (yes) for 924 authored lines plus generated lockfile; retain tests and docs with the API migration.
- Engram mirror: topic `odd/opencode-v2-plugin/tasks`; repository locator `odd/tasks/opencode-v2-plugin.md`.

## Tasks

- [x] OCV2-1 — Port the server plugin and provider integration to native V2 domain APIs.
  - Route: delegated direct; multi-file logic and preparation-for-writing triggers.
  - Register provider/models, custom AI SDK model, tools, agent routing, and owned commands using actual V2 contracts.
  - Align provider dependency/types only as required by the supported V2 package.
  - Adapt existing server/routing/provider tests, preserving regressions rather than deleting assertions.
  - Acceptance: server plugin loads and registrations preserve existing behavior; no legacy runtime hooks remain in the V2 entrypoint.
  - Checks: observed deterministic RED → GREEN → REFACTOR where applicable; `bun test`; `bun run typecheck`; `bun run scripts/smoke.ts`.
  - Commit: pending identity immediately after commit. Risk: high/unassessable; RDD disabled/unmanaged. Proof: writer + independent correction verification passed 89 tests / 334 expectations, typecheck, provider smoke and diff check; parent spot check passed 6 V2 tests / 23 expectations. Explicit size exception accepted.
- [ ] OCV2-2 — Preserve V2 handover feedback and verify packaged runtime integration.
  - Route: delegated direct; multi-file logic, CLI/TUI integration, and verification triggers.
  - Implement companion TUI notifications and visible non-generating handover feedback against verified V2 APIs.
  - Update package exports, V2 configuration/installation documentation, and packaging checks.
  - Add a focused actual V2 plugin-loading smoke check without provider authentication or invoking paid model runs.
  - Acceptance: installable package discovers server and companion entrypoints, handover feedback is visible, setup/disposal works, documentation matches V2 behavior.
  - Checks: focused tests; `bun test`; `bun run typecheck`; `bun run scripts/smoke.ts`; `bun run pack:check`; actual V2 loading smoke when locally available.
  - Commit / risk / proof: pending.

## Verification policy

Use test-first changes when deterministic runnable expected behavior exists. Source-mutating normalization precedes final checks and commits. RDD OFF/unknown path requires native risk assessment after writer return; high or unassessable risk gets independent verification. Report every failed, unavailable, or skipped check. Do not fabricate runtime compatibility from mocks or compilation alone.

## Progress

- Read-only exploration confirmed a distinct published OpenCode V2 plugin package and identified domain API replacements.
- Parity gaps to resolve technically: no server toast API; no V1 session.prompt `noReply` input; actual synthetic-message visibility is not yet verified.
- Existing installed dependencies differ from the lockfile; use a reproducible local install before validating.
- OCV2-1 candidate implemented, not committed or accepted yet. Uses `@opencode/plugin@2.0.22` and `@ai-sdk/provider@3.0.8`.
- Baseline: 81 tests and typecheck passed. Observed RED: native `HerdrPlugin.setup` missing before production port. Writer and independent verifier both observed 83 tests, typecheck, provider smoke and whitespace checks passing after port.
- Independent verification returned partial: synthetic admission errors swallowed by no-op feedback, effort variants lack a proven request-options bridge, and model aliases use catalog ID instead of API model ID. One scoped correction pass authorized; extend exact edit surface with `src/slash.ts` for error propagation.
- Scoped correction completed with observed failing regression tests before fixes. Request-local effort defaults preserve explicit options and both stream/generate; language hook resolves API `modelID`; V2 feedback admission errors propagate; deferred refresh checks unload and logs sanitized failures.
- Independent correction verification passed: 89 tests / 334 expectations, typecheck, provider lifecycle smoke, diff check, additional concurrency and hook-to-controller probes. Parent spot check: `bun test test/v2-server.test.ts` passed (6 tests / 23 expectations).
- Edit-surface deviation: writer changed `test/slash.test.ts` without requesting its addition to the exact allowed surface. Parent surfaced the deviation and independently inspected its 11 added lines: only a legacy cancellation/error-toast regression for the authorized slash correction. Preserve this relevant proof; do not characterize the original write as surface-compliant. No unrelated edits found; future extra paths require prior approval.
- Native risk assessment: high/unassessable (untracked inventory); RDD stays OFF. Required independent correction verification passed.
- One honest slicing assessment: server API switch totals 396 implementation/dependency lines before tests/docs, 715 authored lines including proof. An independently passing split below 400 would require temporary dual-contract machinery. Keep cohesive server slice; explicit `size:exception` consent is pending before commit.
- Corrected server candidate: 924 authored changed lines, excluding generated `bun.lock` and this task document. No second slicing pass; size exception remains pending. Exact published runtime variant-merging/cache behavior, provider reload replay, packaging and visible TUI feedback remain OCV2-2 proof, not established by mocks.

## Next step

Commit the verified and size-exception-accepted server slice, record its identity, then begin OCV2-2 on the second child branch. Do not mark full OpenCode V2 runtime compatibility proven yet.
