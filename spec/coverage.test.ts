/**
 * #44 — the coverage gate. Every row of spec/inventory.md must cite at
 * least one S- or F- rule that is DEFINED in a spec file, or be GAP with an
 * explicit out-of-scope reason. Keyed on identifiers, never on document
 * structure — the lesson of INTENTIUS/chant#2306, where a gate keyed on
 * headings could not see a wrong claim in a bullet list.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const specDir = dirname(fileURLToPath(import.meta.url));
const RULE_FILES = ["grammar.md", "judgments.md", "values.md", "divergence.md", "hosts.md", "rules.md"];
const ID = /\b([SF]-[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)\b/g;

function definedIds(): Set<string> {
  const ids = new Set<string>();
  for (const f of RULE_FILES) {
    for (const ln of readFileSync(join(specDir, f), "utf8").split("\n")) {
      const m =
        /^#{1,6}\s+([SF]-[A-Za-z0-9-]+)\b/.exec(ln) ??          // ## F-Val-Domain — …
        /^\*\*([SF]-[A-Za-z0-9-]+)[.\s(]/.exec(ln) ??           // **F-Eval-Ident.** …
        /^\|\s*([SF]-[A-Za-z0-9-]+)\s*\|/.exec(ln) ??           // | F-Div-Ident | …
        /^\s*([SF]-[A-Za-z0-9-]+)\s*::=/.exec(ln);              // S-Unwrap ::= …
      if (m) ids.add(m[1]);
    }
  }
  return ids;
}

interface Row { id: string; cell: string; line: number }
function rows(): Row[] {
  const out: Row[] = [];
  readFileSync(join(specDir, "inventory.md"), "utf8").split("\n").forEach((ln, i) => {
    const m = /^\| (L\d+\.\d+) \|(.*)\|\s*$/.exec(ln);
    if (!m) return;
    const cells = m[2].split(" | ");
    out.push({ id: m[1], cell: cells[cells.length - 1].trim(), line: i + 1 });
  });
  return out;
}

describe("inventory coverage gate (#44)", () => {
  const defined = definedIds();
  const all = rows();

  test("the inventory has rows and the rule files define identifiers", () => {
    expect(all.length).toBeGreaterThan(50);
    expect(defined.size).toBeGreaterThan(40);
  });

  test("row identifiers are unique", () => {
    const seen = new Set<string>();
    const dup = all.filter((r) => (seen.has(r.id) ? true : (seen.add(r.id), false))).map((r) => r.id);
    expect(dup, "duplicate inventory row ids").toEqual([]);
  });

  test("every row cites a defined rule, or is GAP with an out-of-scope reason", () => {
    const failures: string[] = [];
    for (const r of all) {
      if (r.cell.startsWith("GAP")) {
        if (!/out of scope/i.test(r.cell)) failures.push(`${r.id} (line ${r.line}): GAP without an out-of-scope reason`);
        continue;
      }
      const cited = [...r.cell.matchAll(ID)].map((m) => m[1]);
      if (cited.length === 0) failures.push(`${r.id} (line ${r.line}): cites no S-*/F-* rule — "${r.cell}"`);
      for (const c of cited) if (!defined.has(c)) failures.push(`${r.id} (line ${r.line}): cites undefined rule ${c}`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  test("no row cites the retired R* vocabulary", () => {
    const stale = all.filter((r) => /\bR(?:-spec)?\d+(?:\.\d+)?\b/.test(r.cell)).map((r) => `${r.id}: ${r.cell}`);
    expect(stale, "R* citations remain (retired by #46)").toEqual([]);
  });
});
