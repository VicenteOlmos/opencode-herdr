# OpenCode V2 plugin compatibility

## Objective

Run opencode-herdr as a native OpenCode V2 plugin while preserving Herdr model routing, tools, handover, and user-facing feedback.

## Problem and rationale

The current entrypoint uses the OpenCode V1 Plugin/PluginModule contract and returned hooks. OpenCode V2 requires a new plugin contract and setup-time domain registrations. SDK `/v2` alone does not provide product V2 compatibility.

## Authorized scope and constraints

- User explicitly requested using this plugin with OpenCode V2.
- Target the actual officially documented OpenCode V2 beta runtime, currently `@opencode-ai/cli@0.0.0-beta-17823` (`opencode2`), and its matching published `@opencode-ai/plugin` root Promise API plus `/tui`. The exact tarball has no working `/v2` subpath despite beta docs spelling it that way. Numeric stable package major versions are not proof of product V2 compatibility.
- Preserve model discovery, routing effort, handover lifecycle, commands, debug options, and provider behavior.
- Preserve visible handover feedback without accidentally starting another model turn. Investigate V2 synthetic-message semantics before selecting an implementation.
- Move terminal notifications to a companion CLI/TUI plugin when required by V2.
- User explicitly accepted TUI-local `/herdr-*` execution instead of server callbacks. Mechanical commands run on the client/TUI host; remote-server-transparent execution is out of scope. Detect unsupported remote attachment rather than silently acting on another host.
- Original implementation scope excluded remote delivery. On 2026-10-07 the user explicitly authorized push, chained PR creation/integration, a new version, npm `latest`, and a GitHub release using the configured `gh` session for `github.com/VicenteOlmos/opencode-herdr` and the existing GitHub Actions Trusted Publisher for npm `opencode-herdr`. No other remote execution, credentials, global configuration changes, or changes to untracked `.engram/` are authorized.
- Keep the current dependency versions unchanged, as explicitly requested after the Socket audit; the observed transitive alerts remain unresolved.
- The user explicitly authorized following the actual repository PR policy without adding generic approved-issue forms or extra labels. Preserve required CI, signatures, branch/tag protection, and the selected chain strategy; do not use an administrative bypass.
- English artifacts; Conventional Commits without AI attribution.
- Receipt-driven development is OFF, decided by global preference. Do not enable or start native review.

## Delivery and recovery

- Branch: `feat/opencode-v2-plugin`.
- Branch point / initial review boundary: `0881d41`.
- Delivery strategy: `ask-on-risk`.
- Forecast: 450–700 authored changed lines, excluding generated lockfiles.
- Running committed authored count: 2,219 implementation/test/documentation/release-metadata lines (924 initial + 780 actual-beta server reconciliation + 390 companion + 119 launcher correction/proof docs + 6 release metadata), excluding generated lockfile and task tracking (tracking commit `f845e9f`: 65 lines).
- Chain strategy: `feature-branch-chain`, explicitly selected by user (option 1).
- Local chain: tracker `feat/opencode-v2-plugin` -> initial `feat/opencode-v2-01-server` (`84db6dc`) -> reconciliation `feat/opencode-v2-03-server` (`c04e8a5`) -> companion `feat/opencode-v2-04-feedback` (`a9ec0bc`). The original dirty `feat/opencode-v2-02-feedback` is preserved as recovery WIP, not a delivery slice. Remote delivery is now authorized only within the scope above.
- Server slice `size:exception`: explicitly accepted by user (yes) for 924 authored lines plus generated lockfile; retain tests and docs with the API migration.
- Remaining follow-up `size:exception`: user explicitly accepted both approximately 498 server/catalog/location and 638 TUI/smoke/docs authored-line blocks (1,136 remaining total), preserving coherent tests/docs. Validate actual independent snapshot boundaries before commits; these estimates are not a code-shrinking target. No remote operation granted.
- Engram mirror: topic `odd/opencode-v2-plugin/tasks`; repository locator `odd/tasks/opencode-v2-plugin.md`.

## Tasks

- [x] OCV2-1 — Port the server plugin and provider integration to native V2 domain APIs.
  - Route: delegated direct; multi-file logic and preparation-for-writing triggers.
  - Register provider/models, custom AI SDK model, tools and agent routing using actual V2 beta contracts; owned mechanical commands belong to the companion TUI under the accepted local-only design.
  - Align provider dependency/types only as required by the supported V2 package.
  - Adapt existing server/routing/provider tests, preserving regressions rather than deleting assertions.
  - Acceptance: server plugin loads and registrations preserve existing behavior; no legacy runtime hooks remain in the V2 entrypoint.
  - Checks: observed deterministic RED → GREEN → REFACTOR where applicable; `bun test`; `bun run typecheck`; `bun run scripts/smoke.ts`.
  - Commit: `84db6dc95da57c8453ecec8f367c42674fe4d156` on `feat/opencode-v2-01-server`, base `f845e9f`. Risk: high/unassessable; RDD disabled/unmanaged. Proof: writer + independent correction verification passed 89 tests / 334 expectations, typecheck, provider smoke and diff check; parent spot check passed 6 V2 tests / 23 expectations. Explicit size exception accepted. Slice total: 1,486 changed lines including generated lockfile (543) and task tracking (19); authored behavior/proof/docs: 924.
  - Reopened: actual published V2 beta loaded a plugin identity but did not register Herdr commands/provider/models. The earlier stable-package API port was structurally tested, not compatible with the actual target. Preserve commit/history and reconcile beta APIs on the current integration child branch before closing the task.
- [x] OCV2-2 — Preserve V2 handover feedback and verify packaged runtime integration.
  - Route: delegated direct; multi-file logic, CLI/TUI integration, and verification triggers.
  - Implement companion TUI-local mechanical slash callbacks, notifications and visible non-generating handover feedback against verified V2 beta APIs. No fake server RPC or model-generated command templates.
  - Update package exports, V2 configuration/installation documentation, and packaging checks.
  - Add a focused actual V2 plugin-loading smoke check without provider authentication or invoking paid model runs.
  - Acceptance: installable package discovers server and companion entrypoints, handover feedback is visible, setup/disposal works, documentation matches V2 behavior.
  - Checks: focused tests; `bun test`; `bun run typecheck`; `bun run scripts/smoke.ts`; `bun run pack:check`; actual V2 loading smoke when locally available.
  - Commit: `a9ec0bc27d5411f723592b78a7034cb3ba0db71f`, parent `43e9221` (server tracking after `c04e8a5`). Risk high/unassessable; RDD disabled/unmanaged. Independent proof: 100 tests / 361 expectations, full checks, actual native slot/keymap/status callback/enqueued synthetic feedback and deduplication; cleanup succeeded. Parent spot: 6 TUI tests / 19 expectations. 390 authored + 7 generated lock lines, 37 packaged files. Physical keyboard, real providers and clean installer are untested.

- [x] OCV2-3 — Fix installed npm launcher resolution and validate the actual clean package.
  - Authorization: user explicitly accepted fixing the launcher and repeating clean validation (`dale`). No publication/version change authorized.
  - Route: delegated direct; executable launcher logic plus new regression test, install/runtime verification triggers.
  - Scope: `bin/opencode-herdr-handover`, new `test/launcher.test.ts`; parent-owned feature tracking. Preserve existing native server/TUI and dirty root recovery state.
  - Branch plan: new `fix/opencode-v2-installed-launcher` from final companion `f615bd3`, isolated sibling worktree `opencode-herdr-worktrees/v2-packaging`; child targets `feat/opencode-v2-04-feedback` under existing feature-branch-chain strategy.
  - Forecast: 80–160 authored changed lines, excluding tracking/generated files; smallest complete launcher correction and symlink regression, no artificial splitting.
  - Acceptance: direct package CLI and installed `.bin` symlink resolve the same TypeScript entrypoint; relative/chained links and paths with spaces work; arguments/exit codes/Bun-required error remain intact. Clean production install uses no repository dependencies or prior caches and actual packed server/automatic TUI/native fake runs work.
  - Checks: deterministic regression observed RED → GREEN → REFACTOR; focused launcher test; full tests/typecheck/lifecycle/pack/whitespace; fresh tarball installation/closure/root+TUI exports/bin/skills; native installed package-source server/fake generation and automatic companion proof without real provider calls.
  - Proof: clean `f615bd3` tarball installed 202 packages and imports/closure passed, but installed launcher exits1 (`node_modules/src/handover-cli.ts` missing); direct package invocation has expected usage exit2. Native package scenarios were not launched after failed preflight. No correction made yet.
  - Commit: `9a1fb43f094388e263fb6c89a1df55a91aad813c` on `fix/opencode-v2-installed-launcher`, parent `f615bd3`; 119 authored lines including the passive README proof update. Risk high/unassessable, RDD OFF/unmanaged. Observed RED 1 pass/2 fail → GREEN 3 tests/9 assertions; independent 103 tests/370 expectations and fresh installed/native package proof PASS. ShellCheck unavailable; physical keyboard, real providers and default runtime downloader remain untested.

- [x] OCV2-4 — Prepare the stable V2 release metadata and verify the exact release candidate.
  - Route: delegated direct; metadata/documentation preparation and test/build/install verification triggers.
  - Scope: new `chore/opencode-v2-05-release` child branch from `3157442`; `package.json` and `README.md` only, with parent-owned tracking in this document.
  - Plan: verify that `0.2.0` is unpublished before selecting it; make the V2 compatibility boundary explicit and keep all dependency pins and the runtime source unchanged.
  - Acceptance: available new version; exact dependency and executable bytes preserved; package metadata/docs coherent; CI-compatible full checks and final artifact inspection pass.
  - Checks: exact workflow Bun version where available; full tests, typecheck, lifecycle smoke, supplied-beta catalog smoke, pack dry-run/tarball, launcher regression and whitespace. No artificial RED is applicable to a metadata-only release bump.
  - Forecast: 20–80 authored metadata/documentation lines, plus passive tracking.
  - Commit: `61c864bca4b1e6130595c929026bc09f789d39ed` (`chore(release): prepare 0.2.0 for OpenCode V2`), parent `f973dbf`; exact metadata delta is 3 additions/3 deletions.
  - Proof: writer and independent verifier used Bun 1.3.10; frozen install, 103 tests/370 expectations, typecheck, lifecycle smoke, launcher 3 tests/9 expectations, shell syntax, pack and whitespace all passed. Missing cached beta binary was recovered in an isolated public-registry tool workspace; the exact beta17823 supplied-runtime catalog/no-generation smoke passed. Parent spot check: `git diff --check`.
  - Artifact: 0.2.0, 37 files, SHA256 `568112e9f873b535797991716ed407e6c63bb55c1981c38aa94dba1467210437`; all source/bin/skills/license bytes and modes match `3157442`, dependency fields and `bun.lock` unchanged. Native risk medium/configuration change; RDD OFF/unmanaged; independent verification PASS. Public registry confirmed version available at 2026-10-07T13:17:38Z. Publication-neutral README preserves exact beta scope and prior functional limits.
- [x] OCV2-5 — Deliver and integrate the feature-branch chain under current repository policy.
  - Route: delegated verification for each child snapshot and CI; parent performs authorized Git/`gh` delivery operations.
  - Acceptance: tracker draft/no-merge while children are pending; each child targets its immediate parent; observed required `test` checks pass; signatures verified by GitHub; child integration preserves final source and current `main` infrastructure.
  - Policy: authorized actor has `ADMIN`; main ruleset requires PRs, strict `test`, signed commits, linear history, thread resolution, and allows squash/rebase. No admin bypass. Existing over-budget cohesive slices retain their previously accepted rationale without adding absent labels.
  - Current remote base: `d46bb4493a146e1bfe2f0bc253be77fdd4237230`; only `.github/workflows/pullfrog.yml` changed since `0881d41`, with no source conflict identified.
  - Checks: target-bound PR template/policy, CI/status readback per slice, exact integrated source/dependency comparison, final main CI and clean worktrees. Do not alter unrelated Dependabot PRs 23–26.
- [x] OCV2-5a — Restore independently installable beta-server slice after observed remote CI failure.
  - Route: delegated direct; lockfile diagnosis/correction and independent verification.
  - Evidence: PR #29 (`43e9221`, base `84db6dc`) CI run `37629447548`, Bun 1.3.10 `bun install --frozen-lockfile` fails with `lockfile had changes, but lockfile is frozen`; typecheck/tests skipped. No verified baseline attribution.
  - Scope: `bun.lock` only in the clean `feat/opencode-v2-03-server` worktree; no manifest, source, workflow, or dependency-version changes. The final verified release artifact/lockfile must stay unchanged.
  - Acceptance: observe frozen-install RED on the exact slice, make only the minimal consistency correction preserving every existing resolved version, then frozen install/typecheck/tests/smokes pass locally and current PR CI is green. If a version change is required, stop for human input rather than updating dependencies.
  - Checks: Bun 1.3.10 fresh isolated frozen install; tests/typecheck/lifecycle/supplied-beta catalog; version-set and final-artifact guards; independent verification and current-head GitHub CI.
  - Commit/proof: `8814403d30186d9dc051a030a42f66e1b55a7130` removes only two orphan theme lock records (4 deletions); all 215 retained records identical. Exact frozen RED → GREEN; 94/341 plus full checks. Independent record guard and current-head CI run `37630880832` PASS; GitHub signature valid.
  - Integration guard: plain conflict-free merge could drop theme records now needed by TUI. Normal merge `86e740f` inherits the correction but preserves the exact prior TUI tree/lock blob; independent tree identity and fresh CI run `37631840627` PASS. No dependency-version changes or final artifact changes.

- [x] OCV2-5b — Preserve explicit durable effort clearing in native V2 routing.
  - Route: delegated direct; proven regression plus paired implementation/test files.
  - Scope: `src/index.ts`, `test/v2-server.test.ts`, and `test/v2-context.ts` on beta-server branch; the user explicitly approved these exact three paths. No dependencies/workflows/other files.
  - Edit-surface approval: the user approved the exact three-file surface. Signed correction `099ed9f18d05189daab992cc6b33143e04e21a23` is pushed to PR29; normal companion inheritance `97e8510` changes only the same three paths and preserves lock blob `3ef429b71248ea8de1f5f755e28506e3ba734bed`.
  - Independent RED: omitted/null preserve inherited effort, but explicit durable empty retains high instead of clearing. Native beta rejects an empty variant ID; translate durable empty to native omission/default, not `VariantID.make("")`.
  - Checks: deterministic omitted/empty/populated/null cases RED → GREEN; full server checks/CI; propagate final source without changing lock versions. Review thread `PRRT_kwDOTli2KM6p7hY2` on PR28 is resolved only after verified downstream correction and explanatory readback.
  - Local proof: writer RED 12 pass/1 fail/36 assertions, GREEN 13/36, full server 98/345, typecheck and frozen install pass. Independent focused rerun 13/36 and typecheck PASS. Medium assessed, RDD remains OFF. Current-head PR29 CI `37636352112` PASS, signature verified. Propagated through companion/launcher/release candidate `cdf1a94`; PR28 evidence reply `discussion_r4208267332`, thread read back resolved. Chain integration remains under OCV2-5.
- [x] OCV2-5c — Pair native TUI selected session and working directory at command invocation.
  - Route: delegated direct; proven session/workspace bug plus paired tests.
  - Scope: `src/tui-commands.ts` and `test/tui.test.ts` on companion branch; no dependencies/workflows/other files.
  - Independent RED: setup A, reactive current location B, selected session B → fake controller cwd A while feedback targets B. Beta supports cross-project selection and context location changes without plugin setup rerunning.
  - Acceptance: selected-session validated local directory resolved at invocation; freeze session/directory pair across awaits; missing/unusable location fails closed. No real handover/provider execution in tests.
  - Checks: writer RED 6 pass/4 fail/27 assertions; GREEN TUI 19/70 and full companion 117/416; types, lifecycle, supplied beta17823 catalog and whitespace PASS. Independent focused 19/70 + typecheck PASS. Medium assessed, RDD OFF. Selected pair is captured before async stat and retained through execution/feedback. Signed correction `29360825d9246286259f3bd5ce0dc6b822110d47`, current-head PR30 CI `37637991718` PASS. PR30 evidence reply `discussion_r4208267834`; thread read back resolved.
  - Limitation: validation proves the directory exists on the TUI host, not ownership of an attached remote workspace; no real providers or keyboard checks claimed.

- [x] OCV2-5d — Align the security support table with the authorized stable release.
  - Route: inline mechanical documentation update; one known row, no code changes.
  - Scope: `SECURITY.md` on release branch.
  - Intent: retain existing `0.1.x` support and add `0.2.x` for the requested stable release; do not silently drop support for older consumers.
  - Checks: support row added and read back, 0.1.x retained, whitespace clean. Signed commit `da4fa69` pushed; PR32 support reply `issuecomment-6040314182` confirmed by GraphQL readback.

- [ ] OCV2-6 — Publish and verify the stable release through the existing Trusted Publisher.
  - Route: parent authorized target-bound release/Actions operations; delegated public-registry and artifact verification.
  - Acceptance: signed release tag satisfies policy; stable/non-prerelease GitHub release at the verified integrated commit; exactly one publishing trigger; successful Actions run; npm version and `latest` readback match the candidate.
  - Scope: npm package `opencode-herdr`, GitHub repository `VicenteOlmos/opencode-herdr`, existing `.github/workflows/publish.yml` only; no local npm tokens or OTP, no other session.
  - Checks: version collision/tag existence, signed tag evidence, release commit identity, Actions terminal result and npm public registry metadata/tarball continuity. Unknown write outcomes stop further mutation, never blindly retry.

## Verification policy

Use test-first changes when deterministic runnable expected behavior exists. Source-mutating normalization precedes final checks and commits. RDD OFF/unknown path requires native risk assessment after writer return; high or unassessable risk gets independent verification. Report every failed, unavailable, or skipped check. Do not fabricate runtime compatibility from mocks or compilation alone.

## Progress

- The original stable-package port (`84db6dc`, 89 tests/334 expectations) was retained as an intermediate slice, not advertised as actual product-V2 proof. The real target is beta17823; stable package major numbers and an SDK `/v2` path are not equivalent.
- Beta activation is asynchronous (initial 100ms debounce); smoke waits for definitive inventory rather than interpreting early empty arrays as failure. Actual runtime uses `plugins`, location envelopes, and `location[directory]` parameters.
- Actual-beta server (`c04e8a5`, 94/341) maps tools through owning-session location. Provider refresh/replay is unload guarded. Request-local directory travels in a private header consumed per model invocation and stripped before adapter forwarding; concurrent native A/B fake runs returned HTTP200 with distinct correct working directories.
- The beta's builtin dynamic SDK handler runs before custom hooks; `aisdk:` plus the current package `file://` entry avoids an unintended registry install. Root `createHerdr` supplies AI SDK V3; a native `provider.model` return requires a different schema and that abandoned trial was removed.
- Native companion (`a9ec0bc`, 100/361) uses an owned slot-render keymap layer; commands are explicitly TUI-local. `resume:false` feedback arrives as `session.inbox.enqueued`; flagged direct-toast commands deduplicate, unflagged feedback notifies once. Native setup/render/status/enqueue/disposal proof passed without generation.
- Runtime tests isolate HOME/XDG/test-home, cwd, fake CLIs, local server/auth and child-only `OPENCODE_DISABLE_AUTOUPDATE=1`. Physical keys, real paid providers and the default downloader remain outside the proof.
- Installed launcher (`9a1fb43`) observed RED then GREEN for npm/chained symlinks and preserves mode/quotes/arguments/exit127. Clean production install (202 packages), actual installed CLI, automatic companion discovery and actual packaged fake A/B generation passed; final 103/370. Task fields and final artifact notes preserve exact proof and hashes.
- Release metadata (`61c864b`, tracking `0e71e19`) prepares available0.2.0 without dependency/source changes. Independent Bun1.3.10 checks and recovered suppliedbeta17823 catalog smoke passed. Publication-neutral README remains accurate before and after release.
- Complete older exploration/correction chronology is preserved in Engram topic `odd/opencode-v2-plugin/history-before-review-fixes`; active tasks below retain current facts instead of stale pending/blocked statuses. This maintenance is for recovery/storage accuracy, not code or PR-budget reduction.

## Final local chain and review context

```text
main 0881d41
└─ tracker feat/opencode-v2-plugin: f845e9f (draft/no-merge when remote creation is authorized)
   └─ feat/opencode-v2-01-server: 84db6dc (initial stable-package port; corrected by next child)
      └─ feat/opencode-v2-03-server: c04e8a5 + 43e9221 (actual-beta server and tracking)
         └─ feat/opencode-v2-04-feedback: a9ec0bc + f615bd3 (native companion and tracking)
            └─ fix/opencode-v2-installed-launcher: 9a1fb43 + final tracking update (clean package correction)
```

- Strategy remains feature-branch-chain. Each child targets the immediate preceding branch; never merge tracker before integration/review.
- Start/end: initial V1 migration retained in history; final scoped implementation targets actual beta17823. Server rollback and companion rollback are independent at the named commits.
- Planned remote child boundaries: tracker `f845e9f`; child1 `f845e9f..84db6dc`; child2 `84db6dc..feat/opencode-v2-03-server`; child3 `feat/opencode-v2-03-server..feat/opencode-v2-04-feedback`. Additional child4 boundary: `feat/opencode-v2-04-feedback..fix/opencode-v2-installed-launcher`. Tracking-only commits are passive supporting artifacts, not extra behavior slices.
- Approval/CI/issue linkage and authenticated maintainer ability to apply any remote `size:exception` label remain unverified; user size consent is local planning authority, not a fabricated GitHub label or permission.
- Root recovery workspace remains on dirty `feat/opencode-v2-02-feedback` with its pre-existing source WIP and `.engram/` untouched except parent-owned task tracking updates. Final clean implementation including the installed launcher correction lives in sibling `opencode-herdr-worktrees/v2-packaging`; the verified companion base remains in `v2-feedback`, and server snapshot in `v2-server`. No worktrees removed, refs rewritten, push, PR, merge, release or global config change.

- OCV2-3 closed by `9a1fb43f094388e263fb6c89a1df55a91aad813c` (`fix(cli): resolve installed launcher symlinks`), parent `f615bd3`. Portable iterative `readlink` resolves npm `.bin` and chained relative links before deriving package root; executable mode, quotes, arguments and child/127 exit behavior preserved. New regression observed RED → GREEN; parent spot 3 tests/9 assertions. Full 103 tests/370 expectations, typecheck, lifecycle/catalog/pack/bash syntax/all whitespace pass. ShellCheck unavailable, not claimed. No repository dependencies reused in clean production consumer: 202 packages installed from public registry into fresh credential-free caches; dependency closure/root+TUI imports/bin+skill pass. Actual installed `.bin` returns expected usage exit2 instead of ModuleNotFound.
- Actual packed runtime verification passed: sole fresh consumer moved (not copied/symlinked from old dependencies) into the owned native package cache to avoid fetching published older0.1.3. Native inventory source is package `opencode-herdr`, catalog file URI and executable bytes belong to that fresh installation. Actual packaged runner/fake adapters produce concurrent correct A/B working directories and HTTP200 outputs. Package-source automatic `./tui` discovery exposes all five commands, native status enqueue and unflagged synthetic feedback are rendered; passive observer never imports or initializes the candidate. Clean process/session/fixture shutdown. Safe diagnostics: owned cache `oc-herdr-fixed-package-verify-20261005`.
- Final exact packed artifact continuity verified after passive README proof update: 37 files; all executable/source/package/skill bytes and modes identical to the independently clean-installed/runtime-tested artifact; only README content changed. SHA256 `29adce9065f5c7b3fbe281ab7bd0fe89bdf719aabe6244140744710e67655ca8`; retained under owned cache `oc-herdr-final-artifact-verify-20261005`. Prior pre-README hash `1c874c8f...` is historical, not final. Final packaging blocker CLOSED; scoped stable publication preparation may proceed. This is not a claim of testing physical keyboard, real providers, exact native toast counts in the packaged run, or the default downloader. Compatibility remains pinned to beta17823.

## Next step

Implementation tasks OCV2-1 through OCV2-3 remain complete. OCV2-4 is verified and committed. Execute OCV2-5 and OCV2-6 in order under the explicit delivery/session authorization above. Version `0.2.0` was confirmed unpublished and is now prepared; no publication has occurred. Keep all dependency pins unchanged; Socket findings are documented, not remediated. The clean packaging worktree and dirty root recovery WIP must be preserved. The original functional limits (physical keyboard, real providers, default downloader, unavailable ShellCheck) remain disclosed rather than fabricated proof.

## Authorized remote delivery snapshot

- Delivery authorization: exact GitHub target/session and Actions Trusted Publishing confirmed by user; actual repository-policy override also confirmed. No issue/type/size labels or forms will be added.
- Current main infrastructure-only addition `d46bb44` is a manual-dispatch Pullfrog workflow and will be preserved, not launched or modified.
- Actual PR delta budgets (additions + deletions, generated/tracking included): tracker 65; initial server 1,486; beta reconciliation 1,307; companion 426; launcher plus release-authorization tracking 170; release metadata 6 before final passive proof tracking. Keep the accepted coherent over-budget rationale; do not code-golf or add absent labels.
- Release child: `chore/opencode-v2-05-release`, source commit `61c864b`, targets `fix/opencode-v2-installed-launcher`. Tracker must stay draft/no-merge until all five changes are reviewed and integrated.
- All local commits are signed (local Git reports unknown trust `U`); GitHub signature verification is pending push/readback and must not be prechecked in PR bodies.

- Remote PR identities confirmed: draft tracker [#27](https://github.com/VicenteOlmos/opencode-herdr/pull/27); children [#28](https://github.com/VicenteOlmos/opencode-herdr/pull/28), [#29](https://github.com/VicenteOlmos/opencode-herdr/pull/29), [#30](https://github.com/VicenteOlmos/opencode-herdr/pull/30), [#31](https://github.com/VicenteOlmos/opencode-herdr/pull/31), [#32](https://github.com/VicenteOlmos/opencode-herdr/pull/32), each targeting the immediate parent. All 11 commits are GitHub Verified.
- Initial remote `test` CI: #27/#28/#30/#31/#32 PASS, #29 FAIL at frozen installation; all current heads/bases matched and unresolved review threads were zero. `test` is required only on tracker-to-main, but every child must still pass its own substantive checks. Optional `pullfrog` checks were pending. No child, tracker, tag, release, or publication has been merged/created beyond these PRs.

- Ordinary review claims reproduced independently in one read-only batch: P2 durable-empty variant regression and P1 selected-session/setup-cwd mismatch, 0 pass/2 fail/5 assertions with fake controller and actual plugin hooks. Both are candidate-caused; no automatic thread resolution or unproved native-empty sentinel assumption. OCV2-5b/5c remain pending; no integration/publication proceeds until correction proof.

### Pullfrog inventory and authorized corrections

- Fresh GraphQL inventory for PR27–32: five Pullfrog reviews, two unresolved/non-outdated inline threads (PR28 variant clearing and PR30 session directory). PR29/31 report no new issues; PR32 suggests updating SECURITY support for 0.2.x. Four Socket comments are separate and do not authorize dependency changes.
- User explicitly requested verifying and resolving Pullfrog comments. Correct and verify code findings, update stable support documentation, then post concise evidence and resolve only proven threads. Original workspace WIP remains untouched.

### Verified Pullfrog closure

- Corrected final source candidate `cdf1a94c324903c2fd1638651a8073d02b08b04f`: independent full 120 tests/425 assertions, typecheck, lifecycle and exact beta17823 catalog PASS. PR31 run `37637994738` and PR32 run `37638003272` PASS with exact head/base binding, valid signatures.
- Fresh tarball: `/tmp/opencode-herdr-final-verify.CXor1d/pack/opencode-herdr-0.2.0.tgz`, SHA256 `d918d461100b5ca50799ad7d056cded87c231da57c4ae774d5798ffa3784fad7`, 37 files, all bytes/modes match source. Installed CLI usage/exit2 PASS under ignore-scripts/legacy-peer-deps; automatic peer installation is not proved.
- Package metadata and lock bytes equal `0e71e19`; dependency versions unchanged. Physical keyboard, real providers, default downloader and remote-workspace ownership remain unverified.
- Both Pullfrog inline threads were replied to with regression/CI evidence, then resolved and read back as resolved. PR32 documentation suggestion addressed without dropping 0.1.x support. Initial malformed GraphQL query was rejected before mutation; corrected quoted invocation succeeded once per thread.
- Integration into main and npm/GitHub publication remain pending, not implied by review closure.

### Chain integration before main

- User resumed authorized integration/publication. Clean sibling integration worktree on tracker branch preserves original dirty workspace. Signed merge `d8f8d4f` incorporates current main `d46bb44` infrastructure without rewriting history.
- Confirmed child squash merges, leaf-to-root: PR32 `9f76e9f`, PR31 `c5a9925`, PR30 `81d9609`, PR29 `c9a7d19`, PR28 `157901a1ff8695ec6981ee5a22219ebc289a1f7e`. All child PRs MERGED, all resulting commits verified/valid, no attribution.
- Exact-head test CI before each fold PASS: `37638621977`, `37640450777`, `37640629595`, `37640783932`, `37640930990`. First four folded trees exactly equal `dbeab1f`; final tracker differs only by manual Pullfrog workflow bytes/mode equal current main.
- Actual final tracker test CI `37641066224` PASS, 120 tests/425 assertions, exact head/current-main binding. Earlier PR28 CI used older base metadata, so final tracker CI is the integrated proof. No unresolved threads or new actionable findings.
- Next: commit this passive evidence update, verify latest tracker CI, mark tracker ready and signed squash into main under strict policy. OCV2-5 remains open until main readback; OCV2-6 remains open until signed release and npm latest readback.

### Main integration complete

- PR27 marked ready only after exact tracker head `3c8a2c3` required CI `37641482198` PASS. Signed squash into main `1c290550c6014b41ce47014011ee1d23a5069482`, state MERGED readback, signature verified/valid and tree exactly equal `3c8a2c3`. All PR27–32 MERGED; no bypass or agent-requested branch deletion. Repository auto-delete removed the merged remote tracker, and the authorized passive tracking push recreated it; local branches remain preserved.
- OCV2-5 complete. Clean detached sibling `v2-published-main` pins the exact integrated main for publication checks; original dirty WIP and all existing branches/worktrees preserved. OCV2-6 pending signed tag, GitHub stable release, one existing Actions publish trigger, public npm version/latest continuity.

### Stable publication attempt and retained state

- Exact integrated main `1c290550c6014b41ce47014011ee1d23a5069482` independently reverified: fresh frozen Bun1.3.10 install, typecheck, full120/425, lifecycle and supplied beta17823 catalog PASS; main push CI `37641715641` PASS. Fresh 37-file tarball `/tmp/opencode-herdr-publish-verify.4P8OSU/pack/opencode-herdr-0.2.0.tgz` SHA256 matches `d918d461100b5ca50799ad7d056cded87c231da57c4ae774d5798ffa3784fad7`.
- Signed annotated tag `v0.2.0` created and pushed, tag object `bdd43a6a89e6002102321daaf5c4cca7270da962` points to exact main; GitHub verified=true/reason=valid. Registry check at 2026-10-07T15:06:40Z: 0.2.0 absent, latest0.1.3.
- One stable GitHub release creation attempt (`--verify-tag --latest`) failed with HTTP500. Do not infer successful release or blindly retry. Target-bound readback returned404 for v0.2.0 release; publish.yml run list contained no new release run (latest was Sept21 workflow_dispatch). npm publication was not started.
- OCV2-6 remains incomplete. Signed tag and integrated source retained; no tag deletion/recreation, no manual workflow dispatch, no local npm credentials. Await a human-approved release-creation retry after failure; no further GitHub mutation in this continuation. This local task-document update is not yet pushed.
