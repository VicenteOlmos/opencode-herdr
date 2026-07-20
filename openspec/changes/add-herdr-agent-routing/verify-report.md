```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:66bf2749c32022ae267bb76251b0c07080a47b86fe0d3119eb92035e89bec817
verdict: fail
blockers: 1
critical_findings: 0
requirements: 0/10
scenarios: 0/22
test_command: bun test
test_exit_code: 125
test_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
build_command: bun run typecheck
build_exit_code: 125
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
authority_only_failure: true
missing_review_authority: true
substantive_failure: false
command_failed: false
observed_authority_revision: sha256:12c478d0a08e02158d72647926177b38b1b90927e0066ccdf45c8d4f6561a2ee
```

## Verification Report

**Change**: `add-herdr-agent-routing`  
**Version**: N/A  
**Mode**: Standard  
**Persistence**: Hybrid  
**Verdict**: **FAIL — authority-only preflight denial**

### Authoritative Preflight

`gentle-ai sdd-status add-herdr-agent-routing --cwd /home/vicho/programming/opencode-herdr --json --instructions` denied final verification before command execution:

- `nextRecommended`: `resolve-review`
- `dependencies.verify`: `blocked`
- `reviewState`, `reviewLedger`, `reviewReceipt`, and review authority: missing
- Blocked reason: `verify evidence cannot enter remediation: blockers must be zero for archive readiness; bounded review transaction is missing`

Per final-verification policy, missing review authority requires exit `125` for both declared commands, SHA-256 of exact empty output, and no substantive judgment.

### Current Artifact Counts

| Metric | Value |
|---|---:|
| Capability specs | 5 |
| Requirements | 10 |
| Scenarios | 22 |
| Tasks total | 31 |
| Tasks complete | 31 |
| Tasks incomplete | 0 |

Counts come from current proposal/spec/design/tasks files. Prior verification conclusions were not adopted.

### Build & Tests Execution

| Check | Declared/requested command | Exit | Result | Output SHA-256 |
|---|---|---:|---|---|
| Frozen install | `rm -rf node_modules && bun install --frozen-lockfile` | 125 | Not executed: authority preflight denied verification | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Focused tests | `bun test test/contracts.test.ts test/capabilities.test.ts test/job.test.ts test/herdr.test.ts test/provider.test.ts test/language-model.test.ts test/remediation.test.ts test/phase6.test.ts` | 125 | Not executed | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Full tests | `bun test` | 125 | Not executed | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Typecheck | `bun run typecheck` | 125 | Not executed | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Coverage | `bun test --coverage` | 125 | Not executed | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Real-runner smoke | `bun run smoke` | 125 | Not executed | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Isolated OpenCode provider/config/snapshot | Isolated fake-binary harness | 125 | Not executed | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Fake Herdr generation/lifecycle/abort | Isolated fake-Herdr harness | 125 | Not executed | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Stream metadata ordering | Focused runtime probe | 125 | Not executed | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Missing-Herdr stale/zero-target/tool-fail | Focused runtime probe | 125 | Not executed | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Catalog IDs/limits/native finish | Focused runtime probe | 125 | Not executed | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Command/tool contracts | Focused runtime probe | 125 | Not executed | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

No paid calls, real Herdr jobs, or real-home writes occurred.

### Spec Compliance Matrix

| Requirement | Scenarios | Runtime result |
|---|---:|---|
| Plugin registration | 1 | ⛔ Not evaluated: authority preflight denied verification |
| Runtime command registration | 2 | ⛔ Not evaluated |
| Publish unique model targets | 2 | ⛔ Not evaluated |
| Route only by provider/model selection | 2 | ⛔ Not evaluated |
| Adapt generation and streaming | 3 | ⛔ Not evaluated |
| Represent delegated-agent capability and cancellation | 3 | ⛔ Not evaluated |
| Discover provider targets | 3 | ⛔ Not evaluated |
| Atomic versioned capability JSON | 2 | ⛔ Not evaluated |
| Complete omitted input interactively | 2 | ⛔ Not evaluated |
| Accept direct arguments | 2 | ⛔ Not evaluated |

**Compliance summary**: 0/22 verified in this denied run. This is not a substantive implementation failure.

### Correctness and Design Coherence

Skipped. Authority preflight denied entry before source-to-spec judgment and runtime execution.

### Issues Found

**CRITICAL**: None — substantive checks did not run.  
**WARNING**: None.  
**BLOCKER**: Missing bounded review authority/transaction required for final verification.  
**SUGGESTION**: Resolve review authority, then rerun clean final verification.

### Canonical Authority Preimage

Exact UTF-8 bytes below include trailing newline. `observed_authority_revision` is SHA-256 of these bytes.

```text
review_authority=missing
review_policy=missing
review_ledger=missing
review_transaction=missing
review_receipt=missing
next_recommended=resolve-review
blocked_reason=verify evidence cannot enter remediation: blockers must be zero for archive readiness; bounded review transaction is missing
```

### Canonical Verification Evidence Preimage

Exact UTF-8 bytes below include trailing newline. `evidence_revision` is SHA-256 of these bytes.

```text
authority_only_failure=true|observed_authority_revision=sha256:12c478d0a08e02158d72647926177b38b1b90927e0066ccdf45c8d4f6561a2ee|test=125:sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|build=125:sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

### Verdict

**FAIL** — authority-only denial. Resolve missing review authority before any final-verification commands execute.
