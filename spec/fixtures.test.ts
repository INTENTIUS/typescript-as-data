/**
 * #8 — the reverse gate. Every S- or F- rule defined in a spec file is
 * exercised by at least one fixture, or is listed in spec/fixtures/UNCOVERED.md
 * with a reason; and every rule a fixture cites is defined. Listing a rule as
 * uncovered is a deliberate act — the list may only shrink.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtures, loadRules } from "@intentius/tsad-conformance";

const specDir = dirname(fileURLToPath(import.meta.url));

/** The rule index is the one definition of "defined" (#34); this gate and the citation gate cannot disagree on it. */
function definedIds(): Set<string> {
  return new Set(loadRules(specDir).rules.keys());
}
function uncoveredAllowlist(): Map<string, string> {
  const m = new Map<string, string>();
  for (const ln of readFileSync(join(specDir, "fixtures", "UNCOVERED.md"), "utf8").split("\n")) {
    const x = /^- `([SF]-[A-Za-z0-9-]+)` — (.+)$/.exec(ln); if (x) m.set(x[1], x[2]);
  }
  return m;
}

describe("fixture coverage gate (#8)", () => {
  const defined = definedIds();
  const fixtures = loadFixtures(join(specDir, "fixtures"));
  const cited = new Set(fixtures.flatMap((f) => f.rules));
  const allow = uncoveredAllowlist();

  test("every rule a fixture cites is defined", () => {
    const bad = [...cited].filter((c) => !defined.has(c));
    expect(bad, `fixtures cite undefined rules: ${bad.join(", ")}`).toEqual([]);
  });
  test("the header states the count the gate computes", () => {
    const header = /^(\d+) of (\d+) rules have fixtures\./m.exec(readFileSync(join(specDir, "fixtures", "UNCOVERED.md"), "utf8"));
    const covered = [...defined].filter((d) => cited.has(d)).length;
    expect(header && `${header[1]} of ${header[2]}`, "UNCOVERED.md's header count").toBe(`${covered} of ${defined.size}`);
  });
  test("every defined rule is exercised by a fixture or deliberately listed as uncovered", () => {
    const missing = [...defined].filter((d) => !cited.has(d) && !allow.has(d)).sort();
    expect(missing, `rules with no fixture and no UNCOVERED entry:\n${missing.join("\n")}`).toEqual([]);
  });
  test("the uncovered list contains only rules that are still uncovered (it may only shrink)", () => {
    const stale = [...allow.keys()].filter((a) => cited.has(a) || !defined.has(a));
    expect(stale, `UNCOVERED.md lists rules that now have fixtures or no longer exist: ${stale.join(", ")}`).toEqual([]);
  });
});
