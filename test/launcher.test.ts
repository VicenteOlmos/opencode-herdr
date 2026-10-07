import { expect, test } from "bun:test"
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { tmpdir } from "node:os"

const repository = join(import.meta.dir, "..")
const launcherName = "opencode-herdr-handover"
const bunPath = Bun.which("bun")
const bashPath = Bun.which("bash") ?? "/bin/bash"

async function packageFixture() {
  const temp = await mkdtemp(join(tmpdir(), "opencode herdr launcher "))
  const packageRoot = join(temp, "packages", "opencode herdr")
  const launcher = join(packageRoot, "bin", launcherName)
  await mkdir(dirname(launcher), { recursive: true })
  await cp(join(repository, "bin", launcherName), launcher)
  await cp(join(repository, "src"), join(packageRoot, "src"), { recursive: true })

  const binDirectory = join(temp, "node_modules", ".bin")
  const linksDirectory = join(temp, "node_modules", ".launcher-links")
  await mkdir(binDirectory, { recursive: true })
  await mkdir(linksDirectory, { recursive: true })
  const firstLink = join(linksDirectory, "first link")
  const secondLink = join(linksDirectory, "second link")
  const installedBin = join(binDirectory, launcherName)
  await symlink(relative(dirname(firstLink), launcher), firstLink)
  await symlink(relative(dirname(secondLink), firstLink), secondLink)
  await symlink(relative(binDirectory, secondLink), installedBin)
  return { temp, packageRoot, launcher, installedBin }
}

function run(command: string, args: string[], env: Record<string, string | undefined>) {
  const result = Bun.spawnSync([command, ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  })
  return {
    exitCode: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  }
}

test("installed chained .bin symlink reaches the real CLI usage and exit code", async () => {
  if (process.platform === "win32") return
  const fixture = await packageFixture()
  try {
    const path = `${dirname(bunPath ?? "/usr/bin/bun")}:/usr/bin:/bin`
    const direct = run(fixture.launcher, [], { PATH: path })
    const installed = run(fixture.installedBin, [], { PATH: path })

    expect(direct.exitCode).toBe(2)
    expect(direct.stderr).toStartWith("usage: opencode-herdr-handover ")
    expect(installed.exitCode).toBe(direct.exitCode)
    expect(installed.stderr).toBe(direct.stderr)
    expect(installed.stderr).not.toContain("ModuleNotFound")
  } finally {
    await rm(fixture.temp, { recursive: true, force: true })
  }
})

test("launcher forwards the resolved package entry, arguments, and child exit status", async () => {
  if (process.platform === "win32") return
  const fixture = await packageFixture()
  const fakeBin = join(fixture.temp, "fake bin")
  const recordedArgs = join(fixture.temp, "argv.txt")
  try {
    await mkdir(fakeBin)
    const fakeBun = join(fakeBin, "bun")
    await writeFile(fakeBun, '#!/bin/sh\nprintf "%s\\n" "$@" > "$BUN_ARGS_FILE"\nexit 37\n')
    await chmod(fakeBun, 0o755)
    const result = run(fixture.installedBin, ["--note", "space preserving"], {
      PATH: `${fakeBin}:/usr/bin:/bin`,
      BUN_ARGS_FILE: recordedArgs,
    })
    const args = (await readFile(recordedArgs, "utf8")).trimEnd().split("\n")

    expect(result.exitCode).toBe(37)
    expect(args).toEqual([join(fixture.packageRoot, "src", "handover-cli.ts"), "--note", "space preserving"])
  } finally {
    await rm(fixture.temp, { recursive: true, force: true })
  }
})

test("launcher keeps the Bun-required diagnostic and exit code", async () => {
  if (process.platform === "win32") return
  const fixture = await packageFixture()
  try {
    const noBunPath = join(fixture.temp, "no bun bin")
    await mkdir(noBunPath)
    for (const utility of ["dirname", "readlink"]) {
      await symlink(join("/usr/bin", utility), join(noBunPath, utility))
    }
    const result = run(bashPath, [fixture.installedBin], { PATH: noBunPath })

    expect(result.exitCode).toBe(127)
    expect(result.stderr).toContain("opencode-herdr-handover: bun is required on PATH")
  } finally {
    await rm(fixture.temp, { recursive: true, force: true })
  }
})
