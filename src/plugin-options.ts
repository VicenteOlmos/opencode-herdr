/** Options passed as the second element of an OpenCode path plugin entry. */
export type HerdrPluginOptions = {
  handoverDefault?: string
  /** Keep oh-* panes after jobs finish (inspect runner TTY / [herdr] logs). */
  keepPanes?: boolean
  /** Keep /tmp/.opencode-herdr-* job dirs (request.json / result.json). */
  keepJobs?: boolean
  /**
   * Debug mode for the plugin: implies keepPanes + keepJobs.
   * Also accepted via OPENCODE_HERDR_DEBUG=1.
   */
  debug?: boolean
}

export type HerdrDebugFlags = {
  debug: boolean
  keepPanes: boolean
  keepJobs: boolean
  handoverDefault?: string
}

const truthy = (value: unknown) => value === true || value === "1" || value === "true"

/** Resolve plugin options + env overrides into concrete debug flags. */
export function resolvePluginOptions(options: Record<string, unknown> | undefined | null): HerdrDebugFlags {
  const envDebug = truthy(process.env.OPENCODE_HERDR_DEBUG)
  const envKeepPanes = truthy(process.env.OPENCODE_HERDR_KEEP_PANES)
  const envKeepJobs = truthy(process.env.OPENCODE_HERDR_KEEP_JOBS)
  const debug = truthy(options?.debug) || envDebug
  const keepPanes = debug || truthy(options?.keepPanes) || envKeepPanes
  const keepJobs = debug || truthy(options?.keepJobs) || envKeepJobs
  const handoverDefault =
    typeof options?.handoverDefault === "string" && options.handoverDefault.trim()
      ? options.handoverDefault.trim()
      : typeof process.env.OPENCODE_HERDR_HANDOVER_DEFAULT === "string"
        && process.env.OPENCODE_HERDR_HANDOVER_DEFAULT.trim()
        ? process.env.OPENCODE_HERDR_HANDOVER_DEFAULT.trim()
        : undefined
  return { debug, keepPanes, keepJobs, handoverDefault }
}
