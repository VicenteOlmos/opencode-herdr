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

## Repository protections

`main` and release tags (`v*`) are protected:

- No force-push or branch/tag deletion
- Changes to `main` must go through a pull request
- Commits must be **signed** (SSH or GPG) and Verified on GitHub
- Linear history; CI (`test`) must pass before merge
- Secret scanning + push protection enabled
- CodeQL runs on push/PR

### Signed commits (maintainers)

```bash
git config --local gpg.format ssh
git config --local user.signingkey ~/.ssh/id_ed25519.pub
git config --local commit.gpgsign true
git config --local tag.gpgsign true
```

Add the same public key as an **SSH signing key** at https://github.com/settings/keys (Signing Keys), not only as an authentication key.
