```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:4bbc66535a2865cce0f1f9122ce4634dd9f4609e5efd092808d18749771db83f
verdict: pass
blockers: 0
critical_findings: 0
requirements: 10/10
scenarios: 22/22
test_command: bun test
test_exit_code: 0
test_output_hash: sha256:cf41c7410576f940a34f38cf527eea9a2a9e26f91bfd645ff323fe8244fdfec6
build_command: bun run typecheck
build_exit_code: 0
build_output_hash: sha256:0a7cbec9e31e5ab1dc3f62bf0e9994201b491a121c31235f27316f5151281817
```

## Verification Report

**Change**: `add-herdr-agent-routing`  
**Version**: N/A  
**Mode**: Standard  
**Persistence**: Hybrid  
**Authority**: `review-370dd10bea913d6e`, compact-v2 state `validating`, revision `sha256:49da77a7ac11113a8853f5b883e9f9368f81e4ea87a7f07a30fa71e99f78d8bb`  
**Candidate**: staged tree `3ec1cf59a8b43886b218f2bf61a1fde0e42e3004`

### Completeness

| Metric | Value |
|---|---:|
| Requirements | 10 |
| Scenarios | 22 |
| Tasks total | 31 |
| Tasks complete | 31 |
| Tasks incomplete | 0 |

Counts were measured from current spec and task files. Strict TDD is disabled in `openspec/config.yaml`.

### Build, Tests, Coverage, and Runtime Evidence

| Command | Exit | Output SHA-256 | Result |
|---|---:|---|---|
| `bun install --frozen-lockfile` | 0 | `825b795370b02abb54d371e2e5d05df165d20ae6546cb833c7b2a2fbbbff9b17` | Clean dependency check; no changes |
| `bun test test/phase6.test.ts` | 0 | `8ec256116cddfdd419b984b6e32c6a5a4e5eabf3f66724f09702eb623e058cd4` | 8 passed; adapter parsing and real runner |
| `bun test test/provider.test.ts test/capabilities.test.ts` | 0 | `118778feb1312dc6dd4333f8b021d37d55a7b94844642c5dce19d3edb58a2ef8` | 7 passed; provider/snapshot/stale |
| `bun test test/herdr.test.ts test/remediation.test.ts` | 0 | `a2fbc75e13d82b31fdf6104f02a80211275afb599883deb9ff12188c1aec27bc` | 7 passed; lifecycle/abort/error |
| `bun /tmp/opencode/opencode-herdr-final-spec-contracts.ts` | 0 | `5f4e3fbebe6ee6ac702a18b135770d60e76abbb3c03fb49ec7a3b8405890d138` | V3, transport, command, catalog, stale contracts |
| `bun /tmp/opencode/opencode-herdr-final-active-abort.ts` | 0 | `ce0e52913277f2f38d1f0f29bb6b6975eae938f9b9c0d8f6d388def0c71ad88b` | Active abort and owned cleanup |
| `bun test` | 0 | `cf41c7410576f940a34f38cf527eea9a2a9e26f91bfd645ff323fe8244fdfec6` | 30 passed, 0 failed, 69 assertions |
| `bun run typecheck` | 0 | `0a7cbec9e31e5ab1dc3f62bf0e9994201b491a121c31235f27316f5151281817` | TypeScript no-emit passed |
| `bun test --coverage` | 0 | `7104a71a3f58befae82d56650bd6ed9f2aeb39cac098da09d3eb49a06e44932b` | 90.73% functions, 96.66% lines |
| `bun run smoke` | 0 | `3061c6887284e965db7107ec804d639009464bd43ca0151aa4ef738e94d008db` | Real runner/result path through fake Herdr |
| `/tmp/opencode/opencode-herdr-final-isolated-opencode.sh` | 0 | `f2081402aaf2c8f6a1155d192c9d64ec45f8c15b73d18b72300b09ef7e51bdb4` | OpenCode 1.18.4 provider/snapshot/stale/config isolation |
| `rtk git diff --cached --check` | 0 | `01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b` | Passed |

Coverage threshold is 0%; measured line coverage is 96.66%. No paid calls, real Herdr jobs, or real-home writes occurred.

### Spec Compliance Matrix

| Requirement | Scenario | Runtime evidence | Result |
|---|---|---|---|
| Adapt generation and streaming | Text result | `language-model.test.ts`, spec-contract harness | ✅ COMPLIANT |
| Adapt generation and streaming | Synthetic stream result | `language-model.test.ts`, spec-contract harness | ✅ COMPLIANT |
| Adapt generation and streaming | External error | `remediation.test.ts`, spec-contract harness | ✅ COMPLIANT |
| Delegated-agent capability/cancellation | Delegated-agent tool work | `language-model.test.ts`, spec-contract harness | ✅ COMPLIANT |
| Delegated-agent capability/cancellation | Cancellation | `herdr.test.ts`, active-abort harness | ✅ COMPLIANT |
| Delegated-agent capability/cancellation | Safe task transport | `job.test.ts`, smoke, spec-contract harness | ✅ COMPLIANT |
| Complete omitted input interactively | No arguments | `phase6.test.ts` command-template contract | ✅ COMPLIANT |
| Complete omitted input interactively | Partial arguments | `phase6.test.ts` command-template contract | ✅ COMPLIANT |
| Accept direct arguments | Full direct invocation | `phase6.test.ts` direct-tool contract | ✅ COMPLIANT |
| Accept direct arguments | Missing Herdr | `capabilities.test.ts`, isolated OpenCode harness | ✅ COMPLIANT |
| Publish unique model targets | Catalog listing | `provider.test.ts`, isolated OpenCode harness | ✅ COMPLIANT |
| Publish unique model targets | Unsupported capability | `capabilities.test.ts` | ✅ COMPLIANT |
| Route only by selection | Selected target executes | `remediation.test.ts`, smoke | ✅ COMPLIANT |
| Route only by selection | Missing target | `contracts.test.ts`, `provider.test.ts` | ✅ COMPLIANT |
| Plugin registration | Registered package loads | isolated OpenCode harness | ✅ COMPLIANT |
| Runtime command registration | Command becomes available | `phase6.test.ts`, `remediation.test.ts` | ✅ COMPLIANT |
| Runtime command registration | Restart preserves source config | isolated OpenCode fresh/stale reload harness | ✅ COMPLIANT |
| Discover provider targets | CLI discovery | `capabilities.test.ts`, isolated OpenCode harness | ✅ COMPLIANT |
| Discover provider targets | Probe error | `capabilities.test.ts`, spec-contract harness | ✅ COMPLIANT |
| Discover provider targets | Herdr missing | `capabilities.test.ts`, isolated OpenCode harness | ✅ COMPLIANT |
| Atomic versioned JSON | Successful refresh | `capabilities.test.ts`, isolated OpenCode harness | ✅ COMPLIANT |
| Atomic versioned JSON | Stale snapshot | `capabilities.test.ts`, spec-contract and isolated OpenCode harnesses | ✅ COMPLIANT |

**Compliance summary**: 22/22 scenarios compliant at runtime.

### Correctness

| Requirement | Status | Evidence |
|---|---|---|
| Adapt generation and streaming | ✅ Implemented | V3 text/stream/usage/finish/error contracts pass |
| Delegated-agent capability and cancellation | ✅ Implemented | No fabricated native events; active abort cleanup passes |
| Complete omitted input interactively | ✅ Implemented | Static command template distinguishes omitted fields |
| Accept direct arguments | ✅ Implemented | Direct tool validates exact target/task; unavailable fails |
| Publish unique model targets | ✅ Implemented | Collision-proof IDs and adapter-derived metadata pass |
| Route only by provider/model selection | ✅ Implemented | Exact routing and no substitution pass |
| Plugin registration | ✅ Implemented | Real OpenCode 1.18.4 plugin/provider load passes |
| Runtime command registration | ✅ Implemented | Runtime-only command injection passes |
| Discover provider targets | ✅ Implemented | Four fake CLI catalogs and failure classifications pass |
| Atomic versioned capability JSON | ✅ Implemented | Atomic valid snapshot and stale retention pass |

### Design Coherence

| Decision | Followed? | Notes |
|---|---|---|
| Hook-time provider/model injection | ✅ Yes | Real OpenCode load and byte-identical source config proven |
| Exact root exports and `createHerdr().languageModel()` | ✅ Yes | Source and provider contracts match |
| Adapter-derived delegated tool capability | ✅ Yes | Unsupported adapters do not advertise tools; native events are filtered |
| Fixed argv Herdr agent boundary and owned cleanup | ✅ Yes | Start authority, lifecycle, active abort, and pane ownership pass |
| Atomic capability snapshot | ✅ Yes | Fresh and stale isolated reloads pass |
| Require `HERDR_ENV=1` | ⚠️ Deviation | Runtime validates workspace/tab/pane IDs but does not inspect `HERDR_ENV`; no spec scenario failed |

### Issues Found

**CRITICAL**: None.  
**WARNING**: Design-only deviation: `HERDR_ENV=1` is not explicitly checked.  
**SUGGESTION**: None. Native review informational outcomes remain info and are not reopened.

### Canonical Evidence and Authority Preimages

- Verification evidence: `openspec/changes/add-herdr-agent-routing/verify-evidence.json`
- Exact evidence SHA-256: `4bbc66535a2865cce0f1f9122ce4634dd9f4609e5efd092808d18749771db83f`
- Native transaction preimage: `.git/gentle-ai/review-transactions/v2/review-370dd10bea913d6e/review-state.json`
- Transaction preimage SHA-256: `2fc88ae3da43a24cab07ec521eee3163320c5dfaef627a0eaef96fd26cc3806a`
- Preserved policy hash: `sha256:34fb63d7f29f8613cd4431382b1057398a4816f8a4c20fc34677fffc80a184f6`

Use exact evidence bytes with:

```text
gentle-ai review finalize --cwd /home/vicho/programming/opencode-herdr --lineage review-370dd10bea913d6e --evidence /home/vicho/programming/opencode-herdr/openspec/changes/add-herdr-agent-routing/verify-evidence.json
```

### Verdict

**PASS WITH WARNINGS** — all 10 requirements, 22 scenarios, 31 tasks, runtime checks, typecheck, coverage, smoke, isolated OpenCode, and current authority checks pass; one non-spec-breaking design deviation remains.
