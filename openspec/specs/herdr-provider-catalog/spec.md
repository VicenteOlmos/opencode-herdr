# herdr-provider-catalog Specification

## Purpose

Expose executable Herdr targets as selectable provider models.

## Requirements

### Requirement: Publish unique model targets
The provider MUST expose targets as unique `herdr/<runtime-model>` IDs with accurate name, limits, status, provenance, text support, and tool support.

#### Scenario: Catalog listing
- GIVEN discovery returns runtime/model records
- WHEN OpenCode lists models
- THEN each target has unique ID and truthful metadata

#### Scenario: Unsupported capability
- GIVEN adapter cannot preserve structured tool calls
- WHEN model metadata is published
- THEN tool support is not advertised

### Requirement: Route only by provider/model selection
Provider/model selection MUST be the sole routing signal; unavailable selections MUST fail without substitution.

#### Scenario: Selected target executes
- GIVEN user selects an available `herdr/<runtime-model>` target
- WHEN a request starts
- THEN request routes to that exact target

#### Scenario: Missing target
- GIVEN selected provider or model is missing or unavailable
- WHEN a request starts
- THEN it returns a structured error and does not select another target
