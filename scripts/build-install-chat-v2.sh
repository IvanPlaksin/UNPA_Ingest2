#!/usr/bin/env bash
#
# Build @flowdesk/chat-v2 and install the ARTIFACT into both consumers.
#
# The source lives HERE, in this repo, at packages/flowdesk-chat-v2. It is built here.
# Altiora holds no source at all — only `dist/` + `package.json`, installed by this
# script. That is the whole point: a second copy of the source, however diligently
# hand-synchronised, is a fork, and this component spent long enough as one to drift
# ~900 lines apart across 16 files.
#
#   1. build in packages/flowdesk-chat-v2
#   2. copy dist/ + package.json into mcp/vendor          (this repo's consumer)
#   3. copy dist/ + package.json into Altiora Components  (the portal's consumer)
#   4. npm install in mcp so node_modules picks the new build up
#   5. byte-compare the two installs
#
# The version MUST be bumped before building: npm (--install-links) and Vite both cache
# a same-version rebuild away, and the consumer silently keeps the old bundle.
#
# Usage: bash scripts/build-install-chat-v2.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$REPO/packages/flowdesk-chat-v2"
VENDOR="$REPO/mcp/vendor/flowdesk-chat-v2"
ALT="${CHAT_V2_ALTIORA:-/d/UN/Repos/FlowDesk/FlowDesk/Frontend/Components/flowdesk-chat-v2}"

[ -d "$PKG/src" ] || { echo "package source not found at $PKG" >&2; exit 1; }
[ -d "$ALT" ]     || { echo "Altiora consumer not found at $ALT (override with CHAT_V2_ALTIORA)" >&2; exit 1; }

version() { grep -m1 '"version"' "$1/package.json" | sed 's/.*: *"\(.*\)".*/\1/'; }

NOW="$(version "$PKG")"
for consumer in "$VENDOR" "$ALT"; do
  if [ -f "$consumer/package.json" ] && [ "$(version "$consumer")" = "$NOW" ]; then
    echo "!! version is still $NOW in $(basename "$(dirname "$consumer")")/$(basename "$consumer")." >&2
    echo "   Bump packages/flowdesk-chat-v2/package.json first, or the consumer keeps the old bundle." >&2
    exit 1
  fi
done

echo "==> building $NOW"
( cd "$PKG" && npm run build )

install_into() {
  local dest="$1" label="$2"
  echo "==> installing artifact into $label"
  mkdir -p "$dest/dist"
  cp -f "$PKG"/dist/* "$dest/dist/"
  cp -f "$PKG/package.json" "$dest/package.json"
  [ -f "$PKG/README.md" ] && cp -f "$PKG/README.md" "$dest/README.md"
}

install_into "$VENDOR" "mcp/vendor"
install_into "$ALT" "Altiora"

echo "==> npm install in mcp"
( cd "$REPO/mcp" && npm install @flowdesk/chat-v2 --install-links )

echo
echo "installed $(version "$VENDOR") into mcp/vendor and $(version "$ALT") into Altiora"
fail=0
for f in flowdesk-chat-v2.js flowdesk-chat-v2.cjs flowdesk-chat-v2.css index.d.ts; do
  if cmp -s "$VENDOR/dist/$f" "$ALT/dist/$f"; then echo "  SAME $f"; else echo "  DIFF $f  <-- ARTIFACTS OUT OF SYNC"; fail=1; fi
done
exit $fail
