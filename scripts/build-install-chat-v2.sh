#!/usr/bin/env bash
#
# Build @flowdesk/chat-v2 and install the ARTIFACT into both consumers.
#
# The chat component has exactly one build and two consumers: this repo's mcp SPA and
# the Altiora portal. Neither consumes source — both consume `dist/`. Copying a built
# bundle by hand into one of them and forgetting the other is what let the two copies
# drift apart, so this script is the only supported way to ship a change.
#
#   1. build in the package directory
#   2. copy dist/ + package.json into mcp/vendor  (this repo's consumer)
#   3. copy dist/ + package.json into Altiora     (the portal's consumer)
#   4. npm install in mcp so node_modules picks the new build up
#
# The version MUST be bumped before building: npm and Vite cache a same-version
# rebuild away, and the consumer silently keeps the old bundle.
#
# Usage: bash scripts/build-install-chat-v2.sh
set -euo pipefail

PKG="${CHAT_V2_PKG:-/d/UN/Repos/FlowDesk/FlowDesk/Frontend/Components/flowdesk-chat-v2}"
ALT="$PKG"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$REPO/mcp/vendor/flowdesk-chat-v2"

[ -d "$PKG/src" ] || { echo "package source not found at $PKG" >&2; exit 1; }

version() { grep -m1 '"version"' "$1/package.json" | sed 's/.*: *"\(.*\)".*/\1/'; }

BEFORE="$(version "$VENDOR")"
NOW="$(version "$PKG")"
if [ "$BEFORE" = "$NOW" ]; then
  echo "!! version is still $NOW — bump package.json before building, or the consumers keep the old bundle." >&2
  exit 1
fi

echo "==> building $NOW (installed: $BEFORE)"
( cd "$PKG" && npm run build )

echo "==> installing artifact into mcp/vendor"
mkdir -p "$VENDOR/dist"
cp -f "$PKG"/dist/* "$VENDOR/dist/"
cp -f "$PKG/package.json" "$VENDOR/package.json"
[ -f "$PKG/README.md" ] && cp -f "$PKG/README.md" "$VENDOR/README.md"

# Altiora consumes the very same directory the build wrote to when PKG lives there;
# the copy is a no-op then, and a real install once the source moves into this repo.
if [ "$ALT" != "$PKG" ]; then
  echo "==> installing artifact into Altiora"
  mkdir -p "$ALT/dist"
  cp -f "$PKG"/dist/* "$ALT/dist/"
  cp -f "$PKG/package.json" "$ALT/package.json"
fi

echo "==> npm install in mcp"
( cd "$REPO/mcp" && npm install @flowdesk/chat-v2 --install-links )

echo
echo "installed $(version "$VENDOR") into mcp/vendor and $(version "$ALT") into Altiora"
echo "verify the artifacts are identical:"
for f in flowdesk-chat-v2.js flowdesk-chat-v2.cjs flowdesk-chat-v2.css index.d.ts; do
  if cmp -s "$VENDOR/dist/$f" "$ALT/dist/$f"; then echo "  SAME $f"; else echo "  DIFF $f  <-- ARTIFACTS OUT OF SYNC"; fi
done
