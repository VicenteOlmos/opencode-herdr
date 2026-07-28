#!/usr/bin/env bash
# Publish opencode-herdr to npm.
#
# Usage:
#   ./scripts/publish.sh              # dry-run pack + npm publish --dry-run
#   ./scripts/publish.sh --real       # real publish (requires npm login)
#   ./scripts/publish.sh --real --otp 123456
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REAL=false
OTP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --real) REAL=true; shift ;;
    --otp)
      [ $# -lt 2 ] && { echo "error: --otp requires a code" >&2; exit 2; }
      OTP="$2"; shift 2
      ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      exit 2
      ;;
  esac
done

echo "==> typecheck"
bun run typecheck

echo "==> test"
bun test

echo "==> pack dry-run"
npm pack --dry-run

if [ "$REAL" != true ]; then
  echo "==> npm publish --dry-run"
  npm publish --dry-run --access public
  echo
  echo "Dry-run only. Re-run with --real after:"
  echo "  1) npm login"
  echo "  2) create GitHub repo VicenteOlmos/opencode-herdr (if missing)"
  echo "  3) git push + tag v\$(node -p \"require('./package.json').version\")"
  exit 0
fi

ARGS=(publish --access public)
if [ -n "$OTP" ]; then
  ARGS+=(--otp "$OTP")
fi

echo "==> npm ${ARGS[*]}"
npm "${ARGS[@]}"

VERSION="$(node -p "require('./package.json').version")"
echo
echo "Published opencode-herdr@${VERSION}"
echo "Users install with:"
echo "  opencode plugin opencode-herdr -g"
echo "  # or add \"opencode-herdr\" to ~/.config/opencode/opencode.jsonc plugin[]"
