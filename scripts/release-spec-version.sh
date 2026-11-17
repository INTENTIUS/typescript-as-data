#!/usr/bin/env bash
# Refuse a release whose version does not carry the specification's version:
# the packages' major.minor must equal spec/VERSION, and both packages ship at
# one version. chant.config.ts runs this in the release's build, which the cut
# runs after stamping the label into both package.json files and before it
# records or tags anything, and which the publish job runs again before it
# publishes. Outside a release it checks the committed versions.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

spec=$(tr -d '[:space:]' < spec/VERSION)
conformance=$(node -p 'require("./packages/conformance/package.json").version')
reference=$(node -p 'require("./packages/reference/package.json").version')

fail() { echo "release: $1" >&2; exit 1; }

[ "$conformance" = "$reference" ] ||
  fail "@intentius/tsad-conformance is at $conformance and @intentius/tsad-reference at $reference; one release ships both at one version."

if [ -n "${CHANT_RELEASE_LABEL:-}" ] && [ "${CHANT_RELEASE_LABEL#v}" != "$conformance" ]; then
  fail "the release's label $CHANT_RELEASE_LABEL is not the packages' version $conformance; stamp it with chant release stamp first."
fi

case "$conformance" in
  "$spec".*) echo "release: packages at $conformance carry spec $spec" ;;
  *) fail "version $conformance does not carry spec version $spec (major.minor must equal spec/VERSION). Cut a $spec.x label, or change spec/VERSION first." ;;
esac
