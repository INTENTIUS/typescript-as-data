#!/usr/bin/env bash
# Refuse to cut a release from a commit CI has not proven green. chant's
# scripts/release-preflight.sh, with this repository's workflow name.
#
# A release tag is pushed by hand and the publish workflow re-runs the suite,
# but nothing else checks that the commit being tagged is the one CI ran on,
# or that it was green. This does, before the tag exists.
#
# Usage: scripts/release-preflight.sh   (HEAD must be on main, pushed, and green)
# Emergency opt-out: TSAD_RELEASE_SKIP_PREFLIGHT=1
set -euo pipefail

if [ "${TSAD_RELEASE_SKIP_PREFLIGHT:-}" = "1" ]; then
  echo "preflight: SKIPPED (TSAD_RELEASE_SKIP_PREFLIGHT=1), releasing unverified"
  exit 0
fi

fail() {
  echo "" >&2
  echo "preflight: $1" >&2
  echo "" >&2
  echo "Set TSAD_RELEASE_SKIP_PREFLIGHT=1 to release anyway." >&2
  exit 1
}

branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = "main" ] || fail "on branch \"$branch\"; releases are cut from main."

if ! git diff --quiet || ! git diff --cached --quiet; then
  git status --short --untracked-files=no >&2
  fail "uncommitted changes; commit or stash them before releasing."
fi

git fetch --quiet origin main || fail "could not fetch origin/main."
head=$(git rev-parse HEAD)
remote=$(git rev-parse origin/main)
[ "$head" = "$remote" ] || fail "HEAD ($(git rev-parse --short HEAD)) is not origin/main ($(git rev-parse --short "$remote")); push or pull first."

command -v gh >/dev/null 2>&1 || fail "gh is not installed, so CI status cannot be verified."

# `gh run list --commit` wants the full SHA; a short one returns nothing.
run=$(gh run list --commit "$head" --workflow=ci.yml --limit 1 --json status,conclusion,url 2>/dev/null || echo "")
[ -n "$run" ] && [ "$run" != "[]" ] || fail "no ci run found for $(git rev-parse --short HEAD); push it and let CI run."

status=$(printf '%s' "$run" | jq -r '.[0].status')
conclusion=$(printf '%s' "$run" | jq -r '.[0].conclusion // ""')
url=$(printf '%s' "$run" | jq -r '.[0].url')
[ "$status" = "completed" ] || fail "ci is still $status for $(git rev-parse --short HEAD); wait for it. $url"
[ "$conclusion" = "success" ] || fail "ci concluded \"$conclusion\" for $(git rev-parse --short HEAD). $url"

version=$(node -p 'require("./packages/conformance/package.json").version')
spec=$(tr -d '[:space:]' < spec/VERSION)
case "$version" in
  "$spec".*) ;;
  *) fail "package version $version does not carry spec version $spec (major.minor must match spec/VERSION)." ;;
esac

echo "preflight: main @ $(git rev-parse --short HEAD) is pushed and green; packages at $version carry spec $spec"
echo "next: git tag -a tsad-v$version -m 'tsad-v$version' && git push origin tsad-v$version"
