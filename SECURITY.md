# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

## Reporting a vulnerability

Please open a private advisory on GitHub:

https://github.com/VicenteOlmos/opencode-herdr/security/advisories/new

Or email the maintainer via the contact listed on the [npm package page](https://www.npmjs.com/package/opencode-herdr).

Do not open a public issue for unfixed vulnerabilities.

## Scope notes

This package shells out to local CLIs (`agent`, `claude`, `codex`, `opencode`) through Herdr. Treat those runtimes and their credentials as part of your threat model; do not run untrusted prompts against them.
