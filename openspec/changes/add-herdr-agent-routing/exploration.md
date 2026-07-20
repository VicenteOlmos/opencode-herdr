# Exploration: add-herdr-agent-routing

## Current State

`opencode-herdr` is a generic OpenCode plugin project. It MUST NOT contain SDD-specific concepts, Gentle AI knowledge, agent-role mappings, or consumer-specific policy. It owns generic runtime discovery, capability snapshots, Herdr pane lifecycle, and delegation.

The repository has no implementation yet. Current OpenCode supports JavaScript/TypeScript plugins, plugin-registered custom tools, config-registered commands, and the built-in `question` tool. It does not document a plugin API for registering slash commands dynamically, a direct TUI dialog API for plugins, or a plugin “config hook” that mutates command definitions at runtime.

## Affected Areas

- `openspec/changes/add-herdr-agent-routing/exploration.md` — exploration artifact only.
- Future OpenCode plugin entrypoint — registers generic custom tools and hooks.
- Future runtime discovery/adapter module — detects installed CLIs, models, and builds safe argv.
- Future Herdr boundary — creates panes, runs commands, waits, reads output, reports status, and cleans up.
- Future capabilities snapshot — generic versioned JSON for external consumers; no consumer-specific schema semantics.
- OpenCode config/command setup — static `/herdr-pane` command definition and optional argument forwarding.

## Interaction Options

1. **Config-registered command + model-mediated `question` + plugin custom tool — recommended**
   - Define `/herdr-pane` in `opencode.json`/`opencode.jsonc` under `command`, or ship `.opencode/commands/herdr-pane.md`.
   - Template tells the current OpenCode agent: if arguments are absent, call the built-in `question` tool to ask for runtime and model choices from the latest capability snapshot, then ask for task; finally call the plugin’s custom delegation tool. If arguments exist, parse/validate them and ask only for missing task data.
   - Pros: all pieces are documented current APIs; dynamic choices can be generated at invocation time; noninteractive arguments use `$ARGUMENTS`/`$1`, `$2`, etc.; plugin remains generic.
   - Cons: questions are mediated by the LLM, not a plugin-owned native form; prompt quality and model compliance matter.
   - Effort: Low/Medium

2. **Plugin custom tool only**
   - Expose `herdr_pane` with optional `runtime`, `model`, and `task` arguments. Let the model decide when to call it.
   - Pros: smallest implementation; typed validation and direct plugin execution.
   - Cons: no guaranteed `/herdr-pane` discoverability; no deterministic three-step interaction when invoked without arguments.
   - Effort: Low

3. **Direct TUI dialog API or plugin config hook**
   - Pros: could provide native deterministic selectors if such API existed.
   - Cons: current official docs expose neither a plugin TUI dialog API nor dynamic command registration/config hook. TUI docs cover settings and built-in commands, not plugin dialogs. Plugin docs list lifecycle hooks and custom tools, but no command-registration hook.
   - Effort: Not feasible on documented stable API

## Revised architecture evaluation: generic Herdr provider

`opencode-herdr` owns provider registration, `herdr: true` interpretation, external delegation, and result return. OpenCode v1.18.4 provides a viable arbitrary-provider path: plugin `config` can inject `cfg.provider.herdr`, while model `api.npm` loads a package whose `create*` export returns the AI SDK provider. The provider metadata hook alone cannot execute an external CLI, but it is not required for this path.

### End-to-end execution trace

1. `packages/opencode/src/plugin/index.ts` loads server plugins. `packages/plugin/src/index.ts` defines `Plugin = (input, options?) => Promise<Hooks>`.
2. `Hooks.provider` has exact shape `ProviderHook = { id: string; models?: (provider, ctx) => Promise<Record<string, ModelV2>> }` in `packages/plugin/src/index.ts`; it only customizes models for an existing Models.dev provider. v1.18.4 `provider.ts` does `const provider = database[providerID]; if (!provider) continue` before invoking it, so this hook cannot create an absent `herdr` provider.
3. The arbitrary-provider seam is plugin `config`. `packages/opencode/src/plugin/index.ts` invokes every hook’s `config?.(cfg)` before provider initialization. v1.18.4 `provider.ts` snapshots `Object.entries(cfg.provider ?? {})`, then its “extend database from config” loop creates `database[providerID]` even without Models.dev data and constructs models from config (`api.npm`, `api.url`, capabilities, costs, limits, options, headers). Thus config can inject a complete `herdr` provider.
4. `/models`/provider list exposure follows from that constructed provider record, subject to enabled/disabled filters and non-empty models. Dynamic model refresh must happen in the config hook before provider initialization.
5. The provider service resolves `Provider.getModel()` and then `Provider.getLanguage()` to an AI SDK `LanguageModelV3`. `ProviderHook` has no execution callback, so execution belongs in the package named by model `api.npm`.

### Package resolution proof

v1.18.4 `packages/opencode/src/provider/provider.ts` resolves `model.api.npm`: bundled names use `BUNDLED_PROVIDERS`; other names call `Npm.add`, import its entrypoint, select the first module export whose key starts with `create`, and call it with `{ name: model.providerID, ...provider.options }`. Export `createHerdr` is therefore the required package seam. A `file://` `api.npm` is imported directly.

### Herdr lifecycle proof

Installed Herdr exposes `herdr agent start <name> [--cwd PATH] [--workspace ID] [--tab ID] [--split right|down] [--env KEY=VALUE] [--focus|--no-focus] -- <argv...>`. Use it instead of pane split plus pane run: fixed argv after `--` avoids shell interpolation and returns an agent/terminal target. Retain visibility/status/send/read through `herdr agent list/get/read/send/wait`; track target ownership and make cancellation/cleanup idempotent.
5. `packages/opencode/src/agent/agent.ts` decodes agent config into a known `Info` shape. It reads `model`, permissions, mode, prompt, variant, steps, and presentation fields; it merges only `value.options` into `Info.options`. Top-level `herdr: true` is not a supported field and is not retained. Use:

   ```json
   { "agent": { "worker": {
     "model": "herdr/cursor-agent:gpt-5",
     "options": { "herdr": true }
   } } }
   ```

   The plugin interprets `agent.options.herdr` or namespaced options and validates them. This is provider/model option data, not a first-class OpenCode agent flag.
6. `packages/opencode/src/session/prompt.ts` resolves normal user model as `input.model ?? agent.model ?? currentModel`. `handleSubtask` resolves `task.model` when present, otherwise inherits the parent model, then executes the built-in Task tool. The loop calls `provider.getModel(lastUser.model.providerID, lastUser.model.modelID)` and creates the normal LLM processor. Thus `herdr/...` follows the normal provider path.
7. Plugin hooks cannot transparently replace it: `packages/plugin/src/index.ts` exposes `chat.message`, `chat.params`, `chat.headers`, `tool.execute.before`, and `tool.execute.after`. `packages/opencode/src/session/prompt.ts` uses the tool hooks around Task execution, but hook output mutates/observes arguments/results; no hook replaces the session processor or returns an alternate assistant result.

### Verdict

**Real Herdr-backed AI SDK provider package is required** for picker → agent → subagent → session execution to work transparently. Earlier blocker is narrowed: v1.18.4 permits arbitrary provider injection through plugin `config`; remaining requirement is the AI SDK provider package. Provider-as-display-only still fails at language-model resolution. Custom-tool routing remains explicit only.

Proxy must implement the AI SDK `LanguageModelV3` behavior OpenCode’s LLM processor consumes: text streaming, finish/error/usage, cancellation, and structured tool-call round-tripping if Herdr CLI adapters support it. It translates OpenCode messages/tools to Herdr pane execution and external output back into AI SDK stream parts. If adapters cannot provide structured tool calls, set `capabilities.toolcall: false`; do not advertise normal OpenCode tool execution.

Required provider/model shape:

```json
{
  "provider": { "herdr": {
    "npm": "opencode-herdr",
    "models": { "cursor-agent:gpt-5": {
      "name": "Cursor Agent — GPT-5",
      "provider": { "api": "herdr", "npm": "opencode-herdr" },
      "options": { "runtime": "cursor-agent", "model": "gpt-5", "herdr": true }
    } }
  } },
  "agent": { "worker": {
    "model": "herdr/cursor-agent:gpt-5",
    "options": { "herdr": true }
  } }
}
```

The plugin should use `config(cfg)` to inject `cfg.provider.herdr` and full model records, because `Hooks.provider.models` cannot create a provider absent from Models.dev. The config model’s `provider.npm` becomes `model.api.npm`; OpenCode imports `opencode-herdr` and calls its first `create*` export, so export exactly `createHerdr`. The package must return an AI SDK provider whose `languageModel(modelID)` returns the Herdr-backed model. Metadata alone does not execute a CLI.

Preserve generic `/herdr-pane`: static command + built-in `question` + custom tool remains explicit fallback/diagnostic path. It is not a substitute for transparent provider execution.

## Recommendation

Use one generic OpenCode plugin with a Herdr provider catalog **and** a real AI SDK provider proxy. Keep static `/herdr-pane` for explicit delegation.

Feasible interaction:

1. User invokes `/herdr-pane` with no arguments.
2. Command template instructs OpenCode agent to call `question` with runtime choices derived from the current generic capabilities snapshot. Each choice carries runtime id and availability confidence; unavailable/unknown runtimes remain visible only when useful, and execution tool revalidates.
3. Agent calls `question` for model choices after runtime selection. If model discovery is unavailable, question permits custom text or a declared model.
4. Agent calls `question` for task text.
5. Agent calls plugin custom tool with `{ runtime, model, task, cwd? }`; plugin validates again, builds argv safely, delegates through Herdr, and returns structured status.

With arguments, use command placeholders such as `$1`, `$2`, and `$ARGUMENTS`, for example `/herdr-pane cursor-agent model-id Fix the failing test`. The command template passes supplied values as explicit data to the model/tool and asks only for omitted values. The plugin custom tool itself remains the trust boundary: runtime/model ids are validated and task text is never shell-concatenated.

This is not a plugin config hook: static command registration belongs in OpenCode config or command files. The plugin only registers tools/hooks. Capability discovery can happen when the custom tool runs and can write a generic JSON snapshot separately; the command prompt can reference that snapshot or have the agent call a read-capabilities tool first.

Generic plugin API shape:

- `herdr_capabilities` — discover installed runtimes/models and write/return versioned generic JSON.
- `herdr_pane` — accept validated runtime/model/task and return correlation id, pane id, phase, status, and sanitized diagnostics.
- Optional `herdr_pane_status` / `herdr_pane_cancel` — query or cancel owned work.

Use Herdr CLI wrappers first (`pane split`, `pane run`, `pane read`, `wait agent-status`, `pane close`); use raw socket only for capabilities unavailable through CLI or long-lived event subscriptions. Preserve official Herdr integration authority rather than inventing runtime-specific lifecycle semantics.

## Risks

- The built-in `question` tool is an LLM-callable tool, not documented as a callable UI API from plugin JavaScript. Do not attempt to import or invoke it directly from plugin code.
- Config commands are static prompt templates. Dynamic runtime/model choices cannot be injected into command metadata by a plugin at invocation time; obtain them through a capability tool/snapshot and ask via `question`.
- A command with no arguments cannot itself force execution before the model responds; acceptance depends on the current agent following its template. The custom tool must reject incomplete/invalid requests regardless.
- `$ARGUMENTS` and positional placeholders are prompt substitution, not typed security boundaries. Treat all substituted values as untrusted input and validate in the plugin.
- `opencode.json`/`opencode.jsonc` command configuration is runtime config; `tui.json`/`tui.jsonc` is separate TUI settings. Do not use TUI config for command or plugin registration.
- OpenCode documents JSONC parsing but does not promise comment preservation during config rewrites. Do not implement read-modify-write config editing; write capability snapshots as standalone JSON.
- Local plugin dependencies use a config-directory `package.json` and Bun install at startup; npm plugin dependencies are installed/cached by Bun. Prefer zero dependencies unless needed.
- Herdr pane/process operations are asynchronous. Track ownership, use timeouts, report stable error codes, and make cleanup idempotent.

## Verified OpenCode Evidence

- **Commands:** `https://opencode.ai/docs/commands/` says custom commands are prompt templates executed in the TUI. It documents config `command`, markdown command files, required `template`, `description`, optional `agent`/`subtask`/`model`, and argument placeholders `$ARGUMENTS`, `$1`, `$2`, `$3`.
- **Question tool:** `https://opencode.ai/docs/tools/` lists built-in `question`, says it asks users during execution, and supports a header, question text, options, and custom answers. The same page presents it as an LLM-available tool configured by permissions.
- **Plugin tools:** `https://opencode.ai/docs/plugins/` documents plugin return shape `{ tool: { mytool: tool(...) } }`, `tool.schema`, and `execute`; documented plugin hooks include events such as `command.executed`, `tui.command.execute`, and `tui.toast.show`, but no command-registration/config hook.
- **Plugin loading:** `https://opencode.ai/docs/config/` and `https://opencode.ai/docs/plugins/` document npm plugin registration through `opencode.json`/`opencode.jsonc` `plugin`, plus automatic local loading from `.opencode/plugins/` and `~/.config/opencode/plugins/`.
- **TUI boundary:** `https://opencode.ai/docs/tui/` documents TUI settings in `tui.json`/`tui.jsonc`, built-in slash commands, and command-palette customization; it does not document a plugin-owned dialog API.
- **JSONC/dependencies:** `https://opencode.ai/docs/config/` states OpenCode supports JSON and JSONC. `https://opencode.ai/docs/plugins/` states local external dependencies use config-directory `package.json` and `bun install`; npm plugin packages/dependencies are cached under `~/.cache/opencode/node_modules/`.
- **Local verification:** installed OpenCode exposes `/models` in TUI documentation and `opencode models` in the installed CLI; Herdr exposes pane split/run/read/close and wait commands documented at `https://herdr.dev/docs/cli-reference/` and `https://herdr.dev/docs/socket-api/`.

## Ready for Proposal

Yes. Proposal should define provider registration plus an AI SDK-compatible execution proxy as core scope; `/herdr-pane` remains supported explicit routing. It should not claim that provider metadata, agent hooks, or Task hooks can reroute execution without this proxy.

### Sources

- https://opencode.ai/docs/commands/
- https://opencode.ai/docs/tools/
- https://opencode.ai/docs/plugins/
- https://opencode.ai/docs/config/
- https://opencode.ai/docs/tui/
- https://herdr.dev/docs/cli-reference/
- https://herdr.dev/docs/socket-api/

### v1.18.4 source evidence

- `/home/vicho/.local/share/opencode/tool-output/tool_f810227a4001Sl6dk4RWO1tGv7:1365-1417` — `mergeProvider`, plugin-provider lookup against `database`, and provider-hook model replacement.
- Same file `:1378-1382` — plugins are loaded/configured before `configProviders` snapshot.
- Same file `:1419-1515` — arbitrary config providers/models are constructed, including `provider.npm`/`model.provider.npm` into `model.api.npm`.
- Same file `:1564-1579` — built-in custom loaders only run when provider exists in database; arbitrary `herdr` execution must therefore use model package loading, not `custom(dep)`.
- Same file `:1668-1796` — SDK resolution, `Npm.add`, dynamic import, first `create*` export selection, and provider factory invocation.
- `/home/vicho/.local/share/opencode/tool-output/tool_f810227a4001Sl6dk4RWO1tGv7` is the exact full `provider.ts` evidence requested; upstream equivalent: `packages/opencode/src/provider/provider.ts` at tag `v1.18.4`.

### Authoritative source paths

- https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts — `ProviderHook`, `Plugin`, `Hooks`, and all current plugin hook signatures.
- https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/plugin/index.ts — plugin loading and `config` hook timing.
- https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/provider/provider.ts — provider catalog merge, model schema, `getModel`, `getLanguage`, and `LanguageModelV3` cache.
- https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/agent/agent.ts — agent config decoding; only `value.options` is merged into agent options.
- https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/prompt.ts — user model resolution, subtask model inheritance, Task execution, provider model lookup, and session loop.
