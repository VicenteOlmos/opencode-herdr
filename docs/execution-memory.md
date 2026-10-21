# Execution memory

OpenCode integration remains required: opencode-herdr still supplies the provider,
models, commands, and structured results. Reducing execution overhead does not
remove the OpenCode host or the selected CLI's own memory use.

Adapter output is parsed incrementally. Tool events and old Claude/Cursor answers
are not retained as a transcript. Claude/Cursor still use the last answer; Codex
and OpenCode still concatenate their assistant text events.

Limits are explicit: an individual JSONL event and the retained answer may each
contain at most 8 MiB of UTF-8 text. Exceeding these limits produces an error
result (`adapter event exceeds 8 MiB limit` or
`adapter response exceeds 8 MiB limit`), not silently truncated success.
Diagnostics retain the last 16,384 characters of stderr. Existing result
sanitization and its 16,384-character display limit remain unchanged.

These bounds control runner buffers, not total CLI, OpenCode, or Herdr memory.
Measure identical workloads and concurrency before claiming end-to-end savings.

## Internal native executor

On POSIX systems with `sh` available, the existing OpenCode controller now starts
`bin/opencode-herdr-engine` through the same Herdr pane pool. It invokes the
selected CLI directly, without a separate Bun runner. The already-running
OpenCode host parses captured JSONL using the same incremental parser and writes
the same sanitized, validated `JobResultV1`. This is an internal component, not a
replacement standalone application or an optional OpenCode integration.

The engine needs no compiler, Node, Python, jq, installer, or resident daemon.
It uses the system shell and standard `ln`/`rm` utilities. The OpenCode plugin
still uses Bun; so can the selected target CLI. Windows and systems without a
POSIX shell retain the Bun executor. Set `OPENCODE_HERDR_RUNNER=bun` in OpenCode's
environment to select the compatibility executor explicitly; `native` requires
a POSIX shell. Unknown explicit selections are rejected rather than ignored.

The tradeoff is temporary disk use: native execution stores raw stdout/stderr in
the existing private job directory (mode 0700, capture files mode 0600), then
publishes a complete exit marker. Transcripts are not buffered in shell memory.
Multiline prompts are passed through a mode-0600 command file whose argv values
are individually single-quoted; they never become terminal input or interpolated
shell expressions. The command file is removed with the rest of the job.
The pane shows native start/finish status; detailed transcripts live in these
capture files, not per-event pane progress. Use the Bun backend when per-event
pane progress is needed. Job cleanup removes captures by default. `keepJobs`
also retains these raw transcripts, which can contain sensitive CLI output;
do not share them unredacted. Disk consumption scales with CLI output.

Cancellation uses Herdr's existing Ctrl+C and owned-pane cleanup. Interrupt the
foreground process group, not just the internal shell PID. Result parsing also
checks OpenCode's cancellation signal and result deadline between chunks.
The engine's `--help` documents its internal argv; prompts are never evaluated
as shell code. Model and effort arguments still come from `adapterArgv`.
