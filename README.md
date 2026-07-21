# opencode-herdr

OpenCode 1.18.4 plugin/provider. Add `"opencode-herdr"` to `plugin[]`. At startup it discovers only executable models, injects `provider.herdr`, and exposes `herdr/<adapter>-<model>` selections.

Targets run in an owned visible Herdr agent using argv-safe `herdr agent start ... -- <argv>`. Native tool schemas are not passed into AI SDK tool events; `tool_call` means delegated-agent capability. Cancellation sends Ctrl-C and closes only returned pane. Remove package from `plugin[]` to roll back.

No provider fallback, model substitution, paid probe, or persistent config mutation occurs. Capability snapshots are atomic under `XDG_STATE_HOME/opencode-herdr`.
