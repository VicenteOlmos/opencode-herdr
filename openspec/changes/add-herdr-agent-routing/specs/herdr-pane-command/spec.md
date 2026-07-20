# herdr-pane-command Specification

## Purpose
Provide interactive and direct delegation input using provider/model targets.

## Requirements

### Requirement: Complete omitted input interactively
The command MUST use built-in `question` for omitted provider/model or task values.

#### Scenario: No arguments
- GIVEN user invokes `/herdr-pane` without arguments
- WHEN command executes
- THEN it asks provider/model and task questions before delegation

#### Scenario: Partial arguments
- GIVEN provider/model are supplied but task is omitted
- WHEN command executes
- THEN it asks only for task

### Requirement: Accept direct arguments
The command MUST pass supplied provider/model and task as explicit data and MUST validate them again before execution.

#### Scenario: Full direct invocation
- GIVEN provider/model and task are supplied
- WHEN command executes
- THEN no satisfied field is questioned and validated delegation starts

#### Scenario: Missing Herdr
- GIVEN Herdr service is unavailable
- WHEN command attempts delegation
- THEN it returns an actionable unavailable error and creates no pane
