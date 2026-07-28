# herdr-pane-command Specification

## Purpose
Provide interactive and direct delegation input using runtime (and optional model target) plus task.

## Requirements

### Requirement: Complete omitted input interactively
The command MUST use built-in `question` for omitted runtime/target or task values. Runtime choices SHOULD come from `herdr_capabilities`.

#### Scenario: No arguments
- GIVEN user invokes `/herdr-pane` without arguments
- WHEN command executes
- THEN it asks runtime (from available adapters/targets) and task questions before delegation

#### Scenario: Partial arguments
- GIVEN runtime is supplied but task is omitted
- WHEN command executes
- THEN it asks only for task

### Requirement: Accept direct arguments
The command MUST pass supplied runtime and task as explicit data and MUST validate them again before execution. `herdr_pane` MUST accept a `runtime` that is an adapter id or a full target id.

#### Scenario: Full direct invocation
- GIVEN runtime (or target) and task are supplied
- WHEN command executes
- THEN no satisfied field is questioned and validated delegation starts

#### Scenario: Missing Herdr
- GIVEN Herdr service is unavailable
- WHEN command attempts delegation
- THEN it returns an actionable unavailable error and creates no pane
