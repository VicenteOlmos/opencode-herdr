# Install the OpenCode integration from Herdr

## Objective

Publish a native Herdr companion that installs/configures the existing published OpenCode V2 integration from a global Herdr action, without changing the npm plugin.

## Problem and rationale

The npm package exports OpenCode plugins, while Herdr marketplace discovers native action manifests in GitHub default branches. Use the verified native installer rather than reimplementing JSONC edits or adding dependencies.

## Authorized scope and constraints

- User approved the native install/configure companion after requesting Herdr marketplace publication.
- Exact source surfaces: `herdr-plugin.toml`, `test/herdr-plugin.test.ts`, `README.md`.
- Native action runs `opencode2 plugin add opencode-herdr@0.2.0`; the host needs the verified beta17823 executable on PATH and Bun for the existing integration.
- Native manifest version starts at 0.1.0, separate from the pinned npm version. Require Herdr >=0.9.3 conservatively, with Linux/macOS platforms.
- Preserve npm entrypoints, package metadata, lock, dependencies, existing tests and original dirty workspace. No npm release or GitHub release/tag is needed for marketplace discovery.
- No host-home installation or real-provider generation. Native probes use isolated temporary HOME/XDG and scrubbed credentials.
- User explicitly authorized feature push, PR creation/merge and adding the `herdr-plugin` topic in `VicenteOlmos/opencode-herdr` through the configured gh session; preserve existing topics.

## Delivery strategy

- Strategy: ask-on-risk, one coherent companion PR forecast ~180–250 authored lines, generated files excluded.
- Implementation route: delegated direct; manifest, behavior contract tests and README are paired, and preparation required primary API evidence.
- RDD remains globally OFF; assess the exact writer diff, apply independent verification as required, never fabricate review approval.
- Ordinary signed commits and protected-main required test/linear-history/thread policy apply. No AI attribution. Actual-repository issue/forms/labels exception remains unchanged.

## Tasks

- [x] HMP-1 — Implement the minimal native setup action and documentation.
  - Route: delegated direct; exact three-file surface above, including new untracked manifest and contract test.
  - Acceptance: valid Herdr metadata and global literal argv action, pinned npm version, conservative min version/platforms; documentation states prerequisites, global config scope, idempotency evidence and compatibility limits.
  - Checks: deterministic manifest contract test RED on missing manifest, GREEN after creation; Bun TOML parser, full tests/typecheck, whitespace; package/lock/source entrypoints unchanged.
  - Rollback boundary: remove the native manifest/contract tests and companion README section only; existing npm integration stays intact.
- [x] HMP-2 — Independently verify native action/configuration and publication readiness.
  - Route: delegated verification; isolated command execution with the exact manifest argv, no host configuration.
  - Acceptance: first install succeeds, JSONC unrelated field/comment preserved, repeat is byte-idempotent, correct published package installed; no unsupported UI activation claims.
  - Checks: exact beta17823 native installer owned fixture, contract/type/full suite readback, manifest fields against Herdr v0.9.3 schema; parent spot check and native risk assessment.
- [x] HMP-3 — Publish through default-branch discovery.
  - Route: parent authorized GitHub metadata/PR operations plus bounded verification.
  - Acceptance: Pullfrog finishes and all current comments are verified/resolved, then verified signed feature merged under current main policy, valid manifest on default branch, existing topics preserved plus `herdr-plugin`, topic/default-branch readback; public marketplace discovery verified or clearly pending its documented 30-minute refresh.
  - Checks: target-bound authorization for configured gh session, current rules/CI/head/signatures/threads, exact integrated tree, repository topics and public index without credentials. Unknown writes stop, no blind retries.

## Evidence and next step

- Official sources: https://herdr.dev/docs/plugins/, https://herdr.dev/docs/marketplace/, https://github.com/herdrdev/herdr/blob/v0.9.3/src/app/api/plugins/manifest.rs, https://github.com/herdrdev/herdr/blob/v0.9.3/src/api/schema/plugins.rs, https://opencode.ai/v2/docs/plugins/.
- Published v0.9.3 source proves action contexts include global and argv commands; this is a conservative floor, not a claim of earliest support.
- Existing native installer probe `/tmp/opencode-herdr-native-install.f5F1pI`: beta17823 first/repeat exit0, one global entry, JSONC comment/schema preserved, repeat config byte-identical. Package root/TUI exports exist; plugin-list produced no output, so activation is not claimed.
- Next: bounded writer loads this document and implements HMP-1 with observed RED/GREEN. Remote publication has not begun.

## Local completion evidence

- HMP-1 writer: deterministic missing-manifest RED (0 pass), then GREEN focused1pass/4 expectations; typecheck/full121pass429expectations/frozeninstall/whitespace PASS. Only manifest, contract test and README changed; package/lock/src remain byte/mode-identical to published main1c29055.
- Native assessment initially high/unassessable because parent task document was untracked; after explicitly staging it the exact candidate is medium (configuration_change herdr-plugin.toml). RDD remains OFF; independent verification was retained. Total implementation/tracking candidate105authoredlines, under planning budget.
- HMP-2 independent focused1/4, full121/429, types/stagedwhitespace PASS. Actual manifest argv ran in owned scrubbed fixture `/tmp/opencode-herdr-manifest-action-6diMz5`: firstexit0 installs/configures pinned0.2.0; repeatexit0 alreadyconfigured/config byte-identical. Existing disabled plugin entry, schema and JSONC comment preserved, exactlyone pinnedentry. No fixture symlinks escape; package root/TUI export files exist.
- Tagged officialHerdrv0.9.3 schema validates metadata/globalcontext/literalargv/platforminheritance; no additional permission or entrypoint required. Native UI activation and marketplace visibility are not claimed.
- HMP-3 remains pending delivery, with explicit user authorization for feature push/PR/merge and adding the herdr-plugin topic in VicenteOlmos/opencode-herdr through the configured gh session. No remote publication has begun; native manifest version0.1.0 remains separate from npm0.2.0.

- HMP-1/HMP-2 work-unit evidence commit: `f24c02b6cd070bc47a86be1f113b095d2f05d5de`, Conventional Commit signed using existing local configuration; remote GitHub signature readback is pending authorization/push. Rollback is the manifest/test/README companion section only, preserving existing npm behavior.

## Publication preflight

- User answered yes to the exact target, push/PR/merge/topic operations and configured gh session. Fresh target is public, viewerPermission ADMIN, default main1c29055 unchanged; no existing remote feature branch/open PR. Main requires strict test, signed linear history, resolved threads and zero approvals. Actual lowercase PR template applies; generic forms/issue/labels waiver remains.
- Public index endpoint: https://assets.herdr.dev/plugins/index.json (schemaVersion1); snapshot generated2026-10-07T16:01:12.325Z has no opencode-herdr entry. Topic/default-branch registration is not yet performed; index refresh every30minutes can lag registration. No npm/GitHubrelease/tag action will be used.

## PR33 review wait

- PR33 created/read back OPEN, ready, head `a6366049861efb76ff832d9ae07851aa15281d00` against main1c29055; 120 additions/0 deletions across4files, all3featurecommitsGitHubverified/valid. URL https://github.com/VicenteOlmos/opencode-herdr/pull/33.
- Latest user instruction: wait for Pullfrog to finish, verify its comments and resolve them before merge or topic publication. This is a user-required delivery check even though only test is required by main rules. No merge/topic mutation has occurred.
- Keep the reviewed candidate fixed while waiting; this task-document update is local and not pushed yet, to avoid creating a new candidate unnecessarily. Current source remains identical to the independently checked manifest/test/README.

## Publication complete

- User-required Pullfrog wait satisfied before mutation: check `112899224804` completedSUCCESS on candidate `a636604`; review `5445319872` reported no new issues, with zero inline comments or threads. Review workflow `37652518352` completedSUCCESS; its main-workflow SHA differs from the PR, but the external check/submitted review bind the actual candidate. No corrections or resolution mutations were needed.
- Required PR33 CI `37652512213` PASS, exacthead/base binding. PR33 signed squash merged `2026-10-07T16:35:23Z`, main `261ed990c5837b462dfe0d6d581aa38cf4144bd3`; signature verified/valid and tree exactly equal reviewed candidate. Main push CI `37653237274` PASS.
- Added only the `herdr-plugin` topic via purpose-built gh repo edit; all10pre-existing topics preserved. Default main contains the valid native manifest. No npm publish/GitHubrelease/tag was created by this companion publication; existing npm0.2.0/latest unchanged.
- Fresh public index https://assets.herdr.dev/plugins/index.json checked `2026-10-07T17:04:18Z`: schemaVersion1, generatedAt `2026-10-07T17:01:03.898Z`; exact repo `VicenteOlmos/opencode-herdr` appears with headCommit `261ed990c5837b462dfe0d6d581aa38cf4144bd3`, manifest path `herdr-plugin.toml`, id `opencode-herdr`, name `OpenCode Herdr`, version `0.1.0`, minimumHerdrVersion `0.9.3`, platforms linux/macos, firstSeenAt matching generatedAt.
- Source catalog before registration was stale16:30 and absent; the next17:01 refresh includes the plugin. No stale-cache inference or repeated remote mutation after interruption/restart. Public reads used normal User-Agent/Accept headers, not credentials/challenge bypass.
- All HMP tasks complete. Marketplace catalog visibility is verified; interactive Herdr/OpenCode UI activation, physical keyboard and real-provider generation remain outside the bounded proof. Existing original dirty workspace and npm runtime/dependencies preserved.
- This after-delivery passive recovery record remains on the feature tracking branch; the indexed reviewed default-branch commit is unchanged. Active next step: none required for marketplace publication.
