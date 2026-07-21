# opencode-plugin-registration Specification

## Purpose
Load plugin from runtime configuration and expose provider, models, tools, and command.

## Requirements

### Requirement: Plugin registration
The plugin MUST load from `plugin[]` and register provider, model catalog, capability/delegation tools, and `/herdr-pane` through supported hooks without rewriting configuration.

#### Scenario: Registered package loads
- GIVEN valid runtime configuration contains the plugin package
- WHEN OpenCode starts
- THEN registered surfaces are available and existing configuration remains unchanged

### Requirement: Runtime command registration
The plugin MUST make `/herdr-pane` available in merged runtime commands without persisting command changes.

#### Scenario: Command becomes available
- GIVEN plugin loads into runtime configuration
- WHEN command definitions are merged
- THEN `/herdr-pane` has its required template and description

#### Scenario: Restart preserves source configuration
- GIVEN command was made available at runtime
- WHEN process restarts
- THEN availability depends on registration, not a plugin-written config mutation
