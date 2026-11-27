#!/bin/sh
# Builds the Defold library zip that games add under Project > Dependencies:
#   scripts/defold-library.sh 0.1.0   ->   dist/spritebuddy-defold-0.1.0.zip
# It holds a game.project naming the library folder, the spritebuddy/ folder, and the README.
set -e
version="$1"
[ -n "$version" ] || { echo "usage: $0 <version>" >&2; exit 1; }
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/dist/spritebuddy-defold-$version.zip"
work="$(mktemp -d)"
mkdir -p "$work/spritebuddy-defold" "$root/dist"
cat > "$work/spritebuddy-defold/game.project" <<INI
[project]
title = SpriteBuddy for Defold
version = $version

[library]
include_dirs = spritebuddy
INI
cp -R "$root/packages/defold/spritebuddy" "$root/packages/defold/README.md" "$root/LICENSE" "$work/spritebuddy-defold/"
rm -f "$out"
(cd "$work" && zip -qr "$out" spritebuddy-defold)
rm -rf "$work"
echo "$out"
