/**
 * Fixture format (#7). A directory per fixture under spec/fixtures/<Rule>/<name>/:
 *   input.ts     — the module under test
 *   expect.json  — what a conforming implementation must report
 * expect.json:
 *   { "rules": ["S-Template", "F-Eval-Template"],   // identifiers this fixture exercises (#8 gate)
 *     "export": "x",                                 // which export is judged
 *     "shape": "accept" | "reject",                  // S-* verdict
 *     "fold":  "fold"   | "run",                     // F-* verdict
 *     "value": <json> | "$undefined",                // required when fold = "fold"; the sentinel means the folded value is undefined, which JSON cannot write
 *     "rejectAt": { "line": n, "column": n },        // optional, when fold = "run": where the rejection must point
 *     "note": "why this fixture exists" }
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface Fixture {
  id: string; dir: string; input: string;
  rules: string[]; exportName: string;
  shape: "accept" | "reject"; fold: "fold" | "run";
  value?: unknown; rejectAt?: { line: number; column: number }; note?: string;
}
export function loadFixtures(root: string): Fixture[] {
  const out: Fixture[] = [];
  for (const rule of readdirSync(root)) {
    const rd = join(root, rule); if (!statSync(rd).isDirectory()) continue;
    for (const name of readdirSync(rd)) {
      const d = join(rd, name); if (!statSync(d).isDirectory()) continue;
      const e = JSON.parse(readFileSync(join(d, "expect.json"), "utf8"));
      out.push({ id: `${rule}/${name}`, dir: d, input: readFileSync(join(d, "input.ts"), "utf8"),
        rules: e.rules, exportName: e.export, shape: e.shape, fold: e.fold, value: e.value, rejectAt: e.rejectAt, note: e.note });
    }
  }
  return out;
}
