#!/usr/bin/env bash
# Fetch the external corpus checkouts (#129) at the revisions
# packages/conformance/corpus-external.json pins, into <dir>/<name>, and seed
# each with the chant checkout's node_modules so chant's own fold can resolve
# the lexicon packages from inside them, the same way it does from its own
# examples. The reference resolves them from the chant checkout regardless.
#
# Usage: scripts/fetch-corpus-external.sh <dir> <chant checkout>
set -euo pipefail
dir=${1:?target directory}
chant=${2:?chant checkout}
root=$(cd "$(dirname "$0")/.." && pwd)
manifest="$root/packages/conformance/corpus-external.json"
[ -d "$chant/node_modules" ] || { echo "no node_modules in $chant; install chant's dependencies first" >&2; exit 1; }
node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const c of m.checkouts) console.log(`${c.name}\t${c.repo}\t${c.rev}`);
' "$manifest" | while IFS=$'\t' read -r name repo rev; do
  target="$dir/$name"
  if [ -d "$target/.git" ] && [ "$(git -C "$target" rev-parse HEAD)" = "$rev" ]; then
    echo "$name at $rev already"
  else
    rm -rf "$target"
    mkdir -p "$target"
    git -C "$target" init -q
    git -C "$target" fetch -q --depth 1 "$repo" "$rev"
    git -C "$target" checkout -q FETCH_HEAD
    echo "$name at $(git -C "$target" rev-parse HEAD)"
  fi
  [ -e "$target/node_modules" ] || ln -s "$(cd "$chant" && pwd)/node_modules" "$target/node_modules"
done
