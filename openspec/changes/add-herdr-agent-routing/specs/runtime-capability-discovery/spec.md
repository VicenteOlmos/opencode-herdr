# runtime-capability-discovery Specification

## Purpose
Discover Herdr and four runtime CLIs/models and publish provenance-aware capabilities.

## Requirements

### Requirement: Discover provider targets
The system MUST list Herdr and four supported runtime/model catalogs, classify records as `verified`, `known`, or `unknown`, and never fabricate inventory or capabilities.

#### Scenario: CLI discovery
- GIVEN executable and version probes return valid results
- WHEN discovery runs
- THEN matching runtime and model records include detected availability and provenance

#### Scenario: Probe error
- GIVEN a probe times out or returns malformed output
- WHEN discovery runs
- THEN affected record is `unknown` and diagnostics are sanitized

#### Scenario: Herdr missing
- GIVEN Herdr cannot be discovered
- WHEN capabilities are requested
- THEN Herdr is unavailable and no executable target is marked available

### Requirement: Atomic versioned capability JSON
The system MUST publish valid versioned JSON atomically and MUST NOT expose partial snapshots.

#### Scenario: Successful refresh
- GIVEN discovery completes
- WHEN snapshot is published
- THEN readers see one complete versioned document

#### Scenario: Stale snapshot
- GIVEN fresh discovery cannot complete
- WHEN capabilities are requested
- THEN prior snapshot is marked stale and its version is retained
