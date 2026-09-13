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
 *                    "mode":      "isolated",                                     // optional, J2's ι; "open" by default. An adapter that cannot honour it reports "unavailable"
 *                    "findings":  { "bucket.ts": [ { "rule": "SHAPES001", "subject": "bad", "severity": "error" } ],   // optional (#101): the host's rules' findings, keyed by the
 *                                   "artifact":  [ { "rule": "SHAPES002", "subject": "missing: Bucket", "severity": "warning" } ] }, //   file whose namespace holds the subject (pre) or "artifact" (post); "at" optional
 *                    "counters":  { "projectFactoryInvocations": 0 },              // optional (F-Obs-Counters): the build's counters; the keys given are compared, all three must be reported
 *                    "profiles":  ["full"],                                       // optional; see profilesOf for the default
 *                    "note": "why this fixture exists" }
 * `tentative` and `taintedBy` are what separate "folds because nothing
 * reached it" from "would have folded, and an edge killed it" — without them
 * a project fixture cannot tell F-Seed from F-Taint.
 *
 * `findings` is what an F-Rule-* fixture asserts (#101): the findings of the
 * named host's rules, as data. Matched on rule, subject and severity; the
 * message is non-normative, and a location only when both sides give one.
 *
 * A *roundtrip* fixture (#80) has no source at all. Its input is a namespace
 * as data and the implementation's generator writes the source:
 *   value.json   — { "<export>": <value> }, envelopes as F-Val-Domain writes them, "$undefined" as in expect.json
 *   expect.json  — { "rules": ["F-Val-Source"], "roundtrip": true, "host": "shapes", "profiles": ["data-host"], "note": "…" }
 * The fold of the generated source must equal the input. Judged in
 * `data-host` unless the fixture says otherwise, since in `full` the fold of
 * a resource's form is a live instance and not the envelope (F-Val-Fate).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ExecutionCounters } from "./adapter.js";

export interface ExpressionFixture {
  kind: "expression";
  profiles: Profile[];
  id: string; dir: string; input: string;
  rules: string[]; exportName: string;
  shape: "accept" | "reject"; fold: "fold" | "run";
  value?: unknown; rejectAt?: { line: number; column: number }; note?: string;
}
export interface ExpectedFinding { rule: string; subject: string; severity: "error" | "warning" | "info"; at?: { line: number; column: number } }
export interface ProjectFixture {
  kind: "project";
  profiles: Profile[];
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
  /** J2's ι, `open` unless the fixture says `isolated` (F-IsolatedRefusal). */
  mode?: "open" | "isolated";
  /** The host's rules' findings, keyed by file (pre-synthesis) or "artifact" (post-synthesis). */
  findings?: Record<string, ExpectedFinding[]>;
  /** F-Obs-Counters: the values the build's counters must show. An adapter reporting none is skipped, not failed. */
  counters?: Partial<ExecutionCounters>;
  note?: string;
}
export interface RoundtripFixture {
  kind: "roundtrip";
  profiles: Profile[];
  id: string; dir: string; rules: string[];
  value: Record<string, unknown>;
  host?: string;
  note?: string;
}
export type Fixture = ExpressionFixture | ProjectFixture | RoundtripFixture;

export type Profile = "full" | "data-host";

/**
 * The profiles a fixture is judged in (F-Profile, #78). Explicit
 * `"profiles"` wins. Otherwise: a fixture that names a host, asserts J3's
 * tentative verdicts or taint edges, or constructs with `new` needs the
 * runtime, so it is `full` only; anything else is data and belongs to both.
 */
export function profilesOf(f: Fixture, explicit?: string[]): Profile[] {
  if (explicit) return explicit as Profile[];
  if (f.kind === "roundtrip") return ["data-host"];
  const sources = f.kind === "expression" ? [f.input] : [...f.files.values()];
  const usesNew = sources.some((s) => /\bnew\s+[A-Za-z_$]/.test(s));
  if (f.kind === "project" && (f.host || f.tentative || f.taintedBy)) return ["full"];
  return usesNew ? ["full"] : ["full", "data-host"];
}

/** Kept as the name the expression-only callers import; `kind` narrows. */
export const expressionFixtures = (all: Fixture[]): ExpressionFixture[] => all.filter((f): f is ExpressionFixture => f.kind === "expression");
export const projectFixtures = (all: Fixture[]): ProjectFixture[] => all.filter((f): f is ProjectFixture => f.kind === "project");
export const roundtripFixtures = (all: Fixture[]): RoundtripFixture[] => all.filter((f): f is RoundtripFixture => f.kind === "roundtrip");

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
      if (e.roundtrip) {
        const fx: RoundtripFixture = { kind: "roundtrip", id, dir: d, rules: e.rules, profiles: [], host: e.host, note: e.note,
          value: JSON.parse(readFileSync(join(d, "value.json"), "utf8")) };
        fx.profiles = profilesOf(fx, e.profiles);
        out.push(fx);
      } else if (e.project) {
        const fx: ProjectFixture = { kind: "project", id, dir: d, rules: e.rules, files: readProject(join(d, "project")), profiles: [],
          verdicts: e.verdicts, tentative: e.tentative, taintedBy: e.taintedBy, exports: e.exports, rejectRule: e.rejectRule, host: e.host, mode: e.mode, findings: e.findings, counters: e.counters, note: e.note };
        fx.profiles = profilesOf(fx, e.profiles);
        out.push(fx);
      } else {
        const fx: ExpressionFixture = { kind: "expression", id, dir: d, input: readFileSync(join(d, "input.ts"), "utf8"), profiles: [],
          rules: e.rules, exportName: e.export, shape: e.shape, fold: e.fold, value: e.value, rejectAt: e.rejectAt, note: e.note };
        fx.profiles = profilesOf(fx, e.profiles);
        out.push(fx);
      }
    }
  }
  return out;
}
