// The counts, computed from the tree, in one place.
//
// Every figure the site renders is read from `docs/data/figures.json`, which
// `docs/scripts/sync-spec.mjs` writes. Prose elsewhere restates some of those
// counts by hand, and the restatements drift: `paper/measurements.md` carried
// "76 of the 122" against a tree holding 127 (#174), and `spec/inventory.md`'s
// summary carried 111 rows against a file holding 128 (#182). Both sat beside
// a correct count in the same document.
//
// So the counting lives here and has two consumers: sync-spec.mjs, which feeds
// the site, and spec/figures.test.ts, which holds the prose to it. A single
// definition is the point. A second implementation inside the gate would drift
// from this one the first time somebody adds a fixture kind or nests a
// directory, and it would drift silently, which is the defect the gate exists
// to catch moved one level up into the gate itself.
//
// Same posture as scripts/lib/doc-prose.mjs, extracted in #168 when the prose
// ratchet and check-prose.mjs began duplicating the extractor.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Fixture directories: `spec/fixtures/<rule>/<case>/`, two levels down. */
export function fixtureDirs(specDir) {
  const root = join(specDir, "fixtures");
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(root, d.name), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => join(root, d.name, e.name)),
    );
}

/** `{ fixtures, wholeBuildFixtures }` — whole-build is `"project": true`. */
export function fixtureCounts(specDir) {
  const dirs = fixtureDirs(specDir);
  const wholeBuild = dirs.filter((d) => {
    try {
      return JSON.parse(readFileSync(join(d, "expect.json"), "utf8")).project === true;
    } catch {
      return false;
    }
  }).length;
  return { fixtures: dirs.length, wholeBuildFixtures: wholeBuild };
}

/** `{ rulesWithFixture, rulesTotal }`, read off UNCOVERED.md's own sentence. */
export function coverageCounts(specDir) {
  const text = readFileSync(join(specDir, "fixtures", "UNCOVERED.md"), "utf8");
  const m = /(\d+) of (\d+) rules have fixtures/.exec(text);
  return { rulesWithFixture: m ? +m[1] : null, rulesTotal: m ? +m[2] : null };
}

/**
 * Inventory rows per section and in total, from the `| L<n>.<m> |` rows
 * themselves. The summary table near the foot of the file restates these, and
 * that restatement is what #182 found wrong in four places at once.
 */
export function inventoryRows(specDir) {
  const bySection = new Map();
  for (const line of readFileSync(join(specDir, "inventory.md"), "utf8").split("\n")) {
    const m = /^\|\s*L(\d+)\.\d+\s*\|/.exec(line);
    if (!m) continue;
    const s = `L${m[1]}`;
    bySection.set(s, (bySection.get(s) ?? 0) + 1);
  }
  const total = [...bySection.values()].reduce((a, b) => a + b, 0);
  return { bySection, total };
}
