import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SKILL_REL = join("skills", "herdr", "SKILL.md")

export function bundledSkillPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", SKILL_REL)
}

export function opencodeSkillPath(): string {
  const home = process.env.HOME ?? "/tmp"
  const configHome = process.env.XDG_CONFIG_HOME ?? join(home, ".config")
  return join(configHome, "opencode", "skills", "herdr", "SKILL.md")
}

/** Idempotent install of the vendored Herdr skill into OpenCode config.
 * Overwrites `~/.config/opencode/skills/herdr/SKILL.md` when the bundled copy differs
 * (local edits to that path are clobbered on next plugin config load).
 */
export async function installHerdrSkill(): Promise<"installed" | "unchanged"> {
  const dest = opencodeSkillPath()
  const content = await readFile(bundledSkillPath(), "utf8")
  try {
    if ((await readFile(dest, "utf8")) === content) return "unchanged"
  } catch {
    // missing or unreadable — install below
  }
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, content, { mode: 0o644 })
  return "installed"
}
