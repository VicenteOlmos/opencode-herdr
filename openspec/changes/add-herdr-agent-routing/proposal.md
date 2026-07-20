# Proposal: Add Herdr Provider Routing

## Intent

Create `opencode-herdr` provider whose models delegate OpenCode requests through Herdr using AI SDK `LanguageModelV3`.

## Scope

### In Scope
- Load via `opencode.json` `plugin[]`; register provider, models, tools, and `/herdr-pane` through hooks.
- Expose targets as `herdr/<runtime-model>` with accurate names, limits, status, provenance, and text/tool capabilities.
- Implement `LanguageModelV3` generation, streaming, usage, finish/error, cancellation, and supported structured tool calls.
- Treat provider/model selection as sole routing signal; unavailable selections hard-fail without substitution.
- Discover Herdr and four runtime CLIs/models; atomically publish versioned JSON with `verified`, `known`, or `unknown` provenance.
- Preserve `/herdr-pane`, safe invocation, lifecycle, cancellation, results, and structured errors.

### Out of Scope
- Extra routing flags, consumer policy, config rewriting, daemon, database, or generalized process framework.
- Fabricated model inventories or advertised capabilities unsupported by an adapter.

## Capabilities

### New Capabilities
- `opencode-plugin-registration`: Register package hooks and tools.
- `herdr-provider-catalog`: Publish executable models with accurate metadata.
- `herdr-language-model-proxy`: Bridge AI SDK requests/results and Herdr.
- `runtime-capability-discovery`: Emit atomic provenance-aware capability JSON.
- `herdr-pane-command`: Provide prompted or direct delegation.

### Modified Capabilities
None.

## Approach

Provider hook builds model records from discovery. Each model proxy maps messages, tools, abort signals, and options into one validated adapter and owned pane, then returns compatible response/stream parts. Advertise tools only when adapter preserves structured calls/results. `/herdr-pane` remains a config-hook command using `question` and delegation tools. Use safe argv/encoding, timeouts, sanitization, and idempotent cleanup.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/index.ts`, `src/provider.ts` | New | Provider registration and catalog |
| `src/language-model.ts` | New | `LanguageModelV3` proxy |
| `src/command.ts` | New | Runtime `/herdr-pane` registration |
| `src/capabilities.ts` | New | Discovery and atomic JSON |
| `src/adapters/`, `src/herdr.ts` | New | Adapters and pane lifecycle |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Contract drift | Medium | Version pinning and compatibility tests |
| Capability metadata overclaims | High | Provenance and adapter-verified flags |
| Lost stream/tool structure | High | Disable unsupported features |
| Injection or partial pane failure | Medium | Safe argv, validation, IDs, cleanup |

## Rollback Plan

Remove plugin from `plugin[]` and uninstall package; provider, models, tools, and command disappear.

## Dependencies

- OpenCode, Herdr, AI SDK interfaces, and optional agent CLIs.

## Success Criteria

- [ ] OpenCode lists selectable `herdr/*` models with accurate metadata.
- [ ] Selecting a Herdr model routes through Herdr and returns compatible lifecycle/result.
- [ ] Tool-capable models round-trip structured calls; others do not advertise tool support.
- [ ] Missing provider/model fails without fallback or substitution.
- [ ] Capability JSON and `/herdr-pane` remain functional.
