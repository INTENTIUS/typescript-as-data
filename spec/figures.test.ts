/**
 * The figure gate (#174, #182). A count stated in prose beside a source that
 * could compute it drifts, and this repository has three examples of it:
 *
 *   - `paper/measurements.md` carried "76 of the 122" against a tree holding
 *     127 fixtures, four paragraphs from a correct "127, of which 65".
 *   - `spec/inventory.md`'s summary carried 111 rows against a file holding
 *     128, with three section counts stale and two sections missing.
 *   - a review of this repository reported 168 fixtures by adding two
 *     overlapping greps.
 *
 * Every figure the SITE renders is read from `docs/data/figures.json`, so the
 * site cannot drift. These two documents are outside that mechanism, and
 * `paper/measurements.md` is what the evidence page points at for "the full
 * statement of each measurement".
 *
 * Two checks, because the two documents fail differently.
 *
 * 1. INVENTORY. The summary table restates the row set in the same file, so
 *    it is checked structurally against it, section by section.
 *
 * 2. PAPER. Integers in prose must be a figure the tree can compute, or be
 *    allowlisted. Read over PROSE rather than raw markdown, which is what
 *    keeps the history table out of scope: its rows are pinned to a chant
 *    revision and 108 entries at `chant-v0.70.1` is correct as history.
 *    `scripts/lib/doc-prose.mjs` blanks table rows, so history drops out and
 *    the running prose stays.
 *
 * The allowlist is SHRINK-ONLY, the same discipline `fixtures.test.ts` applies
 * to UNCOVERED.md: an entry that no longer matches anything is a failure, so a
 * stale exemption cannot be left behind.
 *
 * MEASURED at merge: the accepted set is 24 values, 11 of them between 10 and
 * 40. That density is the residual weakness — a per-entry figure quoted from
 * the corpus report, gone stale, coinciding with another accepted value.
 * Narrowing the slurp to the report's own table cells is #190, and it is to be
 * judged against 24 rather than asserted to have helped.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractProse } from "sentences/lint/markdown-prose";
// @ts-expect-error -- plain ESM helpers, no types
import { toProse } from "../scripts/lib/doc-prose.mjs";
// @ts-expect-error -- plain ESM helpers, no types
import { fixtureCounts, coverageCounts, inventoryRows } from "../scripts/lib/figures.mjs";

const specDir = dirname(fileURLToPath(import.meta.url));
const root = join(specDir, "..");

// ── 1. the inventory summary, against the rows it summarises ────────────────

/** The `| L1 statement scan | 7 | 7 | 0 |` table near the foot of inventory.md. */
function summaryTable(): { label: string; section: string; rows: number }[] {
  const out: { label: string; section: string; rows: number }[] = [];
  for (const line of readFileSync(join(specDir, "inventory.md"), "utf8").split("\n")) {
    const m = /^\|\s*(L(\d+))[^|]*\|\s*(\d+)\s*\|/.exec(line);
    if (m) out.push({ label: m[1], section: `L${m[2]}`, rows: +m[3] });
  }
  return out;
}

describe("inventory summary matches the rows it summarises (#182)", () => {
  const actual = inventoryRows(specDir) as { bySection: Map<string, number>; total: number };
  const summary = summaryTable();

  test("every section's count is right", () => {
    const wrong = summary
      .filter((s) => actual.bySection.get(s.section) !== s.rows)
      .map((s) => `${s.section}: summary says ${s.rows}, file has ${actual.bySection.get(s.section) ?? 0}`);
    expect(wrong).toEqual([]);
  });

  test("no section is missing from the summary", () => {
    const listed = new Set(summary.map((s) => s.section));
    const missing = [...actual.bySection.keys()].filter((s) => !listed.has(s));
    expect(missing).toEqual([]);
  });

  test("the stated total matches the row set", () => {
    const stated = /\*\*total\*\*\s*\|\s*\*\*(\d+)\*\*/.exec(readFileSync(join(specDir, "inventory.md"), "utf8"));
    expect(stated && +stated[1]).toBe(actual.total);
  });
});

// ── 2. integers in the paper's prose ────────────────────────────────────────

/** Issue references, versions and years are identifiers, not counts. */
function blankIdentifiers(text: string): string {
  return text
    .replace(/(?:[A-Za-z][\w-]*)?#\d+/g, (m) => " ".repeat(m.length))
    .replace(/\b(?:19|20)\d{2}\b/g, (m) => " ".repeat(m.length));
}

/**
 * Integers the tree can account for. A figure and anything derived from it by
 * subtraction, since the paper legitimately says "the 4 without one".
 */
function computable(): Set<number> {
  const { fixtures, wholeBuildFixtures } = fixtureCounts(specDir);
  const { rulesWithFixture, rulesTotal } = coverageCounts(specDir);
  const report = readFileSync(join(root, "packages", "conformance", "corpus-report.md"), "utf8");
  const nums = new Set<number>([fixtures, wholeBuildFixtures, rulesWithFixture, rulesTotal]);
  // Two hardcoded derivations, because the paper writes "the 4 without one".
  // Not a general "accept N - k": 126 does not pass as "127 without one".
  nums.add(rulesTotal - rulesWithFixture);
  nums.add(fixtures - wholeBuildFixtures);
  // Every figure the corpus run reported, with identifiers blanked FIRST. The
  // blanking has to run on this side too, or the accepted set grows silently
  // whenever somebody writes another issue reference into the report — a
  // number in one place changing what a check elsewhere accepts, which is the
  // failure this gate exists to catch, sitting in the gate's own input.
  for (const m of blankIdentifiers(report).matchAll(/\b(\d{2,4})\b/g)) nums.add(+m[1]);
  return nums;
}

/**
 * Measurements no artifact in this tree can recompute, keyed by `file:number`
 * so a value that is right in one document is not excused in another. `107` is
 * the corpus size at an earlier pin; it is correct inside the history tables,
 * which are rows and therefore already out of scope, and correct here in prose
 * describing that same past analysis.
 */
const ALLOWLIST: Record<string, string> = {
  "measurements.md:111": "the corpus test file's own test count on one run",
  "measurements.md:53": "the exponent in 2^53, not a count",
  "measurements.md:52": "files probed shape by shape at chant-v0.72.1",
  "measurements.md:290": "same probe",
  "measurements.md:68": "same probe",
  "draft.md:15": "the day in appendix B's date, not a count; the previous day coincided with a computable value and passed by luck",
  "draft.md:52": "same probe, restated in the draft",
  "draft.md:290": "same probe",
  "draft.md:68": "same probe",
  "draft.md:21": "entries moved by two later coverage changes",
  "draft.md:79": "same coverage history",
  "draft.md:10": "same coverage history",
  "draft.md:107": "the corpus size during the coverage-history analysis being described",
  "measurements.md:77": "fixtures tagged data-host, computed by the conformance package's profilesOf rather than from the tree",
  "measurements.md:79": "entries the fourth run moved, from the coverage history",
  "measurements.md:10": "same coverage history",
  "measurements.md:21": "same coverage history",
  "related-work.md:248": "a journal volume number, not a count",
};

describe("integers in the paper's prose are computable or allowlisted (#174)", () => {
  const known = computable();
  const used = new Set<string>();
  const unaccounted: string[] = [];

  for (const file of readdirSync(join(root, "paper")).filter((f) => f.endsWith(".md"))) {
    const prose = blankIdentifiers(extractProse(toProse(readFileSync(join(root, "paper", file), "utf8"))));
    for (const m of prose.matchAll(/\b(\d{2,4})\b/g)) {
      const n = +m[1];
      if (known.has(n)) continue;
      const key = `${file}:${n}`;
      if (key in ALLOWLIST) { used.add(key); continue; }
      const at = prose.slice(0, m.index).split("\n").length;
      unaccounted.push(`paper/${file}:${at} — ${n}`);
    }
  }

  test("no integer is unaccounted for", () => {
    expect([...new Set(unaccounted)]).toEqual([]);
  });

  test("the allowlist is shrink-only: every entry is still needed", () => {
    const stale = Object.keys(ALLOWLIST).filter((k) => !used.has(k));
    expect(stale).toEqual([]);
  });
});
