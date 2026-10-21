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
