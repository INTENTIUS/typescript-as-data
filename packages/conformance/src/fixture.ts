/**
 * Fixture format (#7, extended for projects by #24). A directory per fixture
 * under spec/fixtures/<Rule>/<name>/. Two kinds, told apart by what the
 * directory contains.
 *
 * An *expression* fixture judges one export of one file:
 *   input.ts     — the module under test
 *   expect.json  — { "rules": ["S-Template", "F-Eval-Template"],  // identifiers this fixture exercises (#8 gate)
 *                    "export": "x",                               // which export is judged
 *                    "shape": "accept" | "reject",                // S-* verdict
 *                    "fold":  "fold"   | "run",                   // F-* verdict
 *                    "value": <json> | "$undefined",              // required when fold = "fold"; the sentinel, at the top or nested, means the fold yields undefined there, which JSON cannot write (#82)
 *                    "rejectAt": { "line": n, "column": n },      // optional, when fold = "run": where the rejection must point
 *                    "note": "why this fixture exists" }
 *
 * A *project* fixture judges every file of a small build, which is what J3
 * needs: a taint edge cannot be seen in one file.
 *   project/     — the build's source, one or more .ts files, nested allowed
 *   expect.json  — { "rules": ["F-Seed", "F-Succ"],
 *                    "project": true,
 *                    "verdicts":  { "app.ts": "run", "config.ts": "run" },       // final, after J3
 *                    "tentative": { "config.ts": "fold" },                        // optional, J2 before J3 disposed
 *                    "taintedBy": { "config.ts": "app.ts" },                      // optional, the file whose taint reached it
 *                    "exports":   { "config.ts": { "port": 8080 } },              // optional, for files that finally fold
 *                    "rejectRule": { "app.ts": "F-Eval-CallLocal" },              // optional, the rule a run verdict must name; checked when the adapter reports one
 *                    "host":      "shapes",                                       // optional, a named host from host.ts; required if the sources import one
 *                    "note": "why this fixture exists" }
 * `tentative` and `taintedBy` are what separate "folds because nothing
 * reached it" from "would have folded, and an edge killed it" — without them
 * a project fixture cannot tell F-Seed from F-Taint.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface ExpressionFixture {
  kind: "expression";
  id: string; dir: string; input: string;
  rules: string[]; exportName: string;
  shape: "accept" | "reject"; fold: "fold" | "run";
  value?: unknown; rejectAt?: { line: number; column: number }; note?: string;
}
export interface ProjectFixture {
  kind: "project";
  id: string; dir: string; rules: string[];
  /** Path relative to project/, to source. Paths use "/" on every platform. */
  files: Map<string, string>;
  verdicts: Record<string, "fold" | "run">;
  tentative?: Record<string, "fold" | "run">;
  taintedBy?: Record<string, string>;
  exports?: Record<string, Record<string, unknown>>;
  /** The rule a `run` verdict must name, per file. An adapter that reports no rule is not held to it. */
  rejectRule?: Record<string, string>;
  /** A named host from host.ts. Required for any fixture whose sources import one. */
  host?: string;
  note?: string;
}
export type Fixture = ExpressionFixture | ProjectFixture;

/** Kept as the name the expression-only callers import; `kind` narrows. */
export const expressionFixtures = (all: Fixture[]): ExpressionFixture[] => all.filter((f): f is ExpressionFixture => f.kind === "expression");
export const projectFixtures = (all: Fixture[]): ProjectFixture[] => all.filter((f): f is ProjectFixture => f.kind === "project");

function readProject(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".ts")) files.set(relative(dir, p).split(/[\\/]/).join("/"), readFileSync(p, "utf8"));
    }
  };
  walk(dir);
  return files;
}

export function loadFixtures(root: string): Fixture[] {
  const out: Fixture[] = [];
  for (const rule of readdirSync(root)) {
    const rd = join(root, rule); if (!statSync(rd).isDirectory()) continue;
    for (const name of readdirSync(rd)) {
      const d = join(rd, name); if (!statSync(d).isDirectory()) continue;
      const e = JSON.parse(readFileSync(join(d, "expect.json"), "utf8"));
      const id = `${rule}/${name}`;
      if (e.project) {
        out.push({ kind: "project", id, dir: d, rules: e.rules, files: readProject(join(d, "project")),
          verdicts: e.verdicts, tentative: e.tentative, taintedBy: e.taintedBy, exports: e.exports, rejectRule: e.rejectRule, host: e.host, note: e.note });
      } else {
        out.push({ kind: "expression", id, dir: d, input: readFileSync(join(d, "input.ts"), "utf8"),
          rules: e.rules, exportName: e.export, shape: e.shape, fold: e.fold, value: e.value, rejectAt: e.rejectAt, note: e.note });
      }
    }
  }
  return out;
}
