#!/usr/bin/env bash
# The done-when of #23, run before every publish: a fresh directory that is
# neither this repository nor chant installs the two packed tarballs, writes an
# adapter, and gets a conformance report. Plain node, no TypeScript toolchain.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

(cd "$root/packages/conformance" && npm pack --silent --pack-destination "$work" >/dev/null)
(cd "$root/packages/reference" && npm pack --silent --pack-destination "$work" >/dev/null)

cd "$work"
printf '{ "name": "smoke", "private": true, "type": "module" }\n' > package.json
npm install --silent --no-audit --no-fund ./intentius-tsad-conformance-*.tgz ./intentius-tsad-reference-*.tgz

cat > smoke.mjs <<'JS'
import { loadFixtures, runFixtures, compareAdapters, bundledFixturesDir } from "@intentius/tsad-conformance";
import { referenceAdapter } from "@intentius/tsad-reference";

// An adapter that folds nothing: sound, useless, and it must not pass.
const runsEverything = {
  name: "runs-everything",
  specVersion: "undeclared",
  shape: () => "unavailable",
  foldExport: () => ({ ok: false, line: 1, column: 1, message: "runs" }),
};

const fixtures = loadFixtures(bundledFixturesDir());
const reference = await runFixtures(referenceAdapter, fixtures);
const stub = await runFixtures(runsEverything, fixtures);
const disagreements = await compareAdapters(referenceAdapter, runsEverything, fixtures);
const failed = reference.filter((r) => !r.pass);
console.log(`fixtures: ${fixtures.length}; reference passes ${reference.length - failed.length}; stub passes ${stub.filter((r) => r.pass).length}; disagreements ${disagreements.length}`);
if (fixtures.length < 60 || failed.length > 0 || stub.every((r) => r.pass)) {
  console.error(failed.map((r) => `${r.fixture}: ${r.failures.join("; ")}`).join("\n"));
  process.exit(1);
}
JS
node smoke.mjs
