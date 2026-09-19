/**
 * The site is for a normal person, except the specification (#228 follow-on).
 *
 * `docs/content/spec/` is where the rules live and where notation belongs.
 * Everything else — the landing page, what it enables, try it, for your
 * platform, start here, the glossary — is read by someone who has not met any
 * of this, and it should not put a judgment or an equation in front of them.
 *
 * That boundary held by habit and not by anything. It slipped twice in one
 * week, both times from an author who had just been editing the specification:
 * `ι = isolated` on a conformance page, and `fold(generate(v)) = revive(v)`
 * on the round-trip page, in its opening paragraph and again in its limit.
 *
 * A scan that looked only for notation characters reported those pages clean,
 * because the equation was plain ASCII. So this checks three shapes.
 */
import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "docs", "content");
const BUDGET = join(ROOT, "spec", "site-readability-budget.json");

/** Authored pages outside `docs/content/spec/`, which is the specification's own section. */
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return p === join(CONTENT, "spec") ? [] : pages(p);
    return p.endsWith(".md") ? [p] : [];
  });
}

/** Judgment and set notation. Whatever it means, a reader of these pages has not met it. */
const NOTATION = /[⊢⇓⟦⟧μ⋃⊆𝒫⇝Γι∈∀∃∅≠≤≥]/g;

/**
 * An equation in a backtick span. `fold(generate(v)) = v` is the shape, and
 * what distinguishes it from a shell command is a lowercase single-letter
 * argument: `f(v)`, never `exportResources()` or `Date.now()`.
 */
const EQUATION = /`[^`]*\b[a-z]+\([a-z]\)[^`]*`|`[^`]*\)\s*=\s*[a-z]/g;

/** A rule identifier. Allowed, but counted: the budget only shrinks. */
const RULE_ID = /\b[SF]-[A-Z][A-Za-z]*(?:-[A-Za-z]+)*\b/g;

const read = (p: string) => readFileSync(p, "utf8");
const key = (p: string) => relative(CONTENT, p);

describe("pages outside the specification are readable by someone who has not met it", () => {
  test("no judgment or set notation", () => {
    const found = pages(CONTENT).flatMap((p) =>
      [...new Set(read(p).match(NOTATION) ?? [])].map((c) => `${key(p)}: ${c}`),
    );
    expect(found, "notation belongs in docs/content/spec/").toEqual([]);
  });

  test("no equations", () => {
    const found = pages(CONTENT).flatMap((p) =>
      (read(p).match(EQUATION) ?? []).map((m) => `${key(p)}: ${m}`),
    );
    expect(found, "state the property in words and link the rule that gives the equation").toEqual([]);
  });

  test("rule identifiers per page, shrink-only", () => {
    // Naming a rule once so a reader can find it is fair. A page that reads
    // like the specification is not, and the way that happens is one
    // identifier at a time. The budget is the count at the last deliberate
    // look, and it may fall and never rise.
    const counts: Record<string, number> = {};
    for (const p of pages(CONTENT)) {
      const n = (read(p).match(RULE_ID) ?? []).length;
      if (n > 0) counts[key(p)] = n;
    }
    if (process.env.TSAD_UPDATE_SITE_BUDGET) {
      writeFileSync(BUDGET, JSON.stringify(counts, null, 2) + "\n");
      return;
    }
    const budget: Record<string, number> = JSON.parse(read(BUDGET));
    const grew = Object.entries(counts)
      .filter(([f, n]) => n > (budget[f] ?? 0))
      .map(([f, n]) => `${f}: ${budget[f] ?? 0} -> ${n}`);
    expect(grew, "rewrite it in words, or re-baseline with TSAD_UPDATE_SITE_BUDGET=1 if it is deliberate").toEqual([]);
    const stale = Object.keys(budget).filter((f) => !(f in counts));
    expect(stale, "budget entry matches nothing; the page lost its identifiers, so drop the entry").toEqual([]);
  });
});
