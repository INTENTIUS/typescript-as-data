import type { ConformanceAdapter, Finding, RulePhase } from "./adapter.js";
import type { ExpressionFixture, Fixture, ProjectFixture, RoundtripFixture } from "./fixture.js";
import { expressionFixtures, projectFixtures, roundtripFixtures } from "./fixture.js";
import { requireHost } from "./host.js";

export interface FixtureReport { fixture: string; adapter: string; pass: boolean; skipped?: string; failures: string[] }

/**
 * The comparison form of a folded value. `JSON.stringify` drops an
 * `undefined`-valued key and turns an `undefined` element into `null`, which
 * is exactly the distinction F-Val-Undefined draws (#82): a fixture that wants
 * to see it writes the sentinel `"$undefined"` where the fold must yield
 * `undefined`, and this encoding maps the fold's `undefined` to the same
 * sentinel before the two are compared. Non-finite numbers, which JSON cannot
 * write either, encode as ToString would print them.
 */
export function encodeValue(v: unknown): string {
  const walk = (x: unknown): unknown => {
    if (x === undefined) return "$undefined";
    if (typeof x === "number" && !Number.isFinite(x)) return String(x);
    if (x === null || typeof x !== "object") return x;
    if (Array.isArray(x)) return x.map(walk);
    return Object.fromEntries(Object.entries(x).map(([k, e]) => [k, walk(e)]));
  };
  return JSON.stringify(walk(v));
}

export function runFixture(adapter: ConformanceAdapter, f: ExpressionFixture): FixtureReport {
  const failures: string[] = []; let skipped: string | undefined;
  const s = adapter.shape(f.input, f.exportName);
  if (s === "unavailable") skipped = "shape classifier unavailable";
  else if (s.accepted !== (f.shape === "accept")) failures.push(`shape: expected ${f.shape}, got ${s.accepted ? "accept" : `reject (${s.message})`}`);
  const r = adapter.foldExport(f.input, f.exportName);
  if (f.fold === "fold") {
    if (!r.ok) failures.push(`fold: expected fold, got run (${r.message})`);
    else if (encodeValue(r.value) !== encodeValue(f.value)) failures.push(`fold: value ${encodeValue(r.value)} ≠ expected ${encodeValue(f.value)}`);
  } else {
    if (r.ok) failures.push(`fold: expected run, got fold with ${JSON.stringify(r.value)}`);
    else if (f.rejectAt && (r.line !== f.rejectAt.line || r.column !== f.rejectAt.column))
      failures.push(`fold: rejection at ${r.line}:${r.column}, expected ${f.rejectAt.line}:${f.rejectAt.column}`);
  }
  return { fixture: f.id, adapter: adapter.name, pass: failures.length === 0, skipped, failures };
}
export async function runFixtures(adapter: ConformanceAdapter, fixtures: Fixture[]): Promise<FixtureReport[]> {
  return [
    ...expressionFixtures(fixtures).map((f) => runFixture(adapter, f)),
    ...(await Promise.all(projectFixtures(fixtures).map((f) => runProjectFixture(adapter, f)))),
    ...(await Promise.all(roundtripFixtures(fixtures).map((f) => runRoundtripFixture(adapter, f)))),
  ];
}

/**
 * #80 — the round trip. The input is data; the implementation's generator
 * writes source for it and the fold of that source must be the input. The
 * "$undefined" sentinel in value.json is decoded before generation so the
 * generator sees the value the domain has.
 */
export async function runRoundtripFixture(adapter: ConformanceAdapter, f: RoundtripFixture): Promise<FixtureReport> {
  const base = { fixture: f.id, adapter: adapter.name };
  if (!adapter.generate || !adapter.foldProject) return { ...base, pass: true, skipped: "no generator", failures: [] };
  const host = f.host ? requireHost(f.host) : undefined;
  const source = adapter.generate(decodeValue(f.value) as Record<string, unknown>, host);
  if (source === "unavailable") return { ...base, pass: true, skipped: "generator unavailable for this value", failures: [] };
  const r = await adapter.foldProject(new Map([["generated.ts", source]]), host);
  if (r === "unavailable") return { ...base, pass: true, skipped: "project entry unavailable", failures: [] };
  const failures: string[] = [];
  const v = r.verdicts["generated.ts"];
  if (v?.kind !== "fold") failures.push(`generated source does not fold${v?.kind === "run" ? ` (${v.reason})` : ""}:\n${source}`);
  else {
    for (const name of new Set([...Object.keys(f.value), ...Object.keys(v.exports)])) {
      if (!(name in f.value)) { failures.push(`export ${name} generated but not in the input`); continue; }
      if (encodeValue(v.exports[name]) !== encodeValue(f.value[name])) failures.push(`export ${name} = ${encodeValue(v.exports[name])} ≠ input ${encodeValue(f.value[name])}\n${source}`);
    }
  }
  return { ...base, pass: failures.length === 0, failures };
}

/** The inverse of encodeValue's sentinel: "$undefined" in fixture data is the domain's undefined. */
export function decodeValue(v: unknown): unknown {
  if (v === "$undefined") return undefined;
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(decodeValue);
  return Object.fromEntries(Object.entries(v).map(([k, e]) => [k, decodeValue(e)]));
}

/** #24 — a whole-build fixture. J3's edges are invisible in any single file, so this is the only shape that can test them. */
export async function runProjectFixture(adapter: ConformanceAdapter, f: ProjectFixture): Promise<FixtureReport> {
  const base = { fixture: f.id, adapter: adapter.name };
  if (!adapter.foldProject) return { ...base, pass: true, skipped: "no project entry", failures: [] };
  const r = await adapter.foldProject(f.files, f.host ? requireHost(f.host) : undefined);
  if (r === "unavailable") return { ...base, pass: true, skipped: "project entry unavailable", failures: [] };
  const failures: string[] = [];
  for (const [path, want] of Object.entries(f.verdicts)) {
    const got = r.verdicts[path];
    if (!got) { failures.push(`${path}: no verdict reported`); continue; }
    if (got.kind !== want) failures.push(`${path}: expected ${want}, got ${got.kind}${got.kind === "run" ? ` (${got.reason})` : ""}`);
  }
  for (const path of Object.keys(r.verdicts)) if (!(path in f.verdicts)) failures.push(`${path}: verdict reported but not expected`);
  for (const [path, want] of Object.entries(f.tentative ?? {})) {
    if (!r.tentative) { failures.push(`${path}: fixture expects a tentative verdict, adapter reports none`); continue; }
    if (r.tentative[path] !== want) failures.push(`${path}: tentative expected ${want}, got ${r.tentative[path] ?? "none"}`);
  }
  for (const [path, want] of Object.entries(f.taintedBy ?? {})) {
    if (!r.taintedBy) { failures.push(`${path}: fixture expects a taint source, adapter reports none`); continue; }
    if (r.taintedBy[path] !== want) failures.push(`${path}: tainted by ${r.taintedBy[path] ?? "nothing"}, expected ${want}`);
  }
  for (const [path, want] of Object.entries(f.rejectRule ?? {})) {
    const got = r.verdicts[path];
    if (got?.kind !== "run") { failures.push(`${path}: expected a ${want} rejection, but the file folded`); continue; }
    if (got.rule !== undefined && got.rule !== want) failures.push(`${path}: rejected under ${got.rule}, expected ${want} (${got.reason})`);
  }
  for (const [path, want] of Object.entries(f.exports ?? {})) {
    const got = r.verdicts[path];
    if (got?.kind !== "fold") { failures.push(`${path}: expected exports, but the file did not fold`); continue; }
    for (const [name, value] of Object.entries(want)) {
      if (encodeValue(got.exports[name]) !== encodeValue(value)) {
        failures.push(`${path}: export ${name} = ${encodeValue(got.exports[name])} ≠ expected ${encodeValue(value)}`);
      }
    }
  }
  if (f.findings) {
    const got = await collectFindings(adapter, f);
    if (got === "unavailable") return { ...base, pass: failures.length === 0, skipped: "rules unavailable", failures };
    failures.push(...compareFindings(f.findings, got));
  }
  return { ...base, pass: failures.length === 0, failures };
}

/** The key a finding is filed under: the file whose namespace holds the subject, or the artifact. */
const findingKey = (x: Finding, phase: RulePhase): string => (phase === "post" ? "artifact" : x.file ?? "artifact");
const findingSig = (x: { rule: string; subject: string; severity: string }): string => `${x.rule} ${x.severity} ${x.subject}`;

/**
 * Every finding of both phases (#101). Each phase is run twice and the two
 * runs must agree: F-Rule-Pure says a rule is a function of its input, and
 * a rule that reads a clock or the environment fails here before its
 * findings are compared with anything.
 */
export async function collectFindings(adapter: ConformanceAdapter, f: ProjectFixture): Promise<Map<string, Finding[]> | "unavailable"> {
  if (!adapter.rules || !f.host) return "unavailable";
  const host = requireHost(f.host);
  const out = new Map<string, Finding[]>();
  for (const phase of ["pre", "post"] as const) {
    const first = await adapter.rules(f.files, host, phase);
    if (first === "unavailable") return "unavailable";
    const second = await adapter.rules(f.files, host, phase);
    if (second === "unavailable") return "unavailable";
    const a = first.map((x) => `${findingKey(x, phase)}: ${findingSig(x)}`).sort(), b = second.map((x) => `${findingKey(x, phase)}: ${findingSig(x)}`).sort();
    if (a.join("\n") !== b.join("\n")) throw new Error(`${f.id}: ${phase}-synthesis findings differ between two runs of the same input (F-Rule-Pure)\n${a.join("\n")}\n---\n${b.join("\n")}`);
    for (const x of first) { const k = findingKey(x, phase); out.set(k, [...(out.get(k) ?? []), x]); }
  }
  return out;
}

/** Findings matched on rule, subject and severity; `at` only when both sides carry one. */
export function compareFindings(want: Record<string, { rule: string; subject: string; severity: string; at?: { line: number; column: number } }[]>, got: Map<string, Finding[]>): string[] {
  const failures: string[] = [];
  for (const key of new Set([...Object.keys(want), ...got.keys()])) {
    const w = want[key] ?? [], g = got.get(key) ?? [];
    for (const x of w) {
      const hit = g.find((y) => findingSig(y) === findingSig(x));
      if (!hit) { failures.push(`${key}: expected finding ${findingSig(x)}, not reported`); continue; }
      if (x.at && hit.at && (hit.at.line !== x.at.line || hit.at.column !== x.at.column)) failures.push(`${key}: ${findingSig(x)} at ${hit.at.line}:${hit.at.column}, expected ${x.at.line}:${x.at.column}`);
    }
    for (const y of g) if (!w.some((x) => findingSig(x) === findingSig(y))) failures.push(`${key}: finding ${findingSig(y)} reported but not expected (${y.message})`);
  }
  return failures;
}

/** #11 — two implementations must agree on every fixture, independently of what the fixture expects. */
export async function compareAdapters(a: ConformanceAdapter, b: ConformanceAdapter, fixtures: Fixture[]): Promise<string[]> {
  const dis: string[] = [];
  for (const f of projectFixtures(fixtures)) {
    if (!a.foldProject || !b.foldProject) continue;
    const host = f.host ? requireHost(f.host) : undefined;
    const [ra, rb] = await Promise.all([a.foldProject(f.files, host), b.foldProject(f.files, host)]);
    if (ra === "unavailable" || rb === "unavailable") continue;
    for (const path of new Set([...Object.keys(ra.verdicts), ...Object.keys(rb.verdicts)])) {
      const va = ra.verdicts[path]?.kind ?? "absent", vb = rb.verdicts[path]?.kind ?? "absent";
      if (va !== vb) dis.push(`${f.id} ${path}: ${a.name} ${va}, ${b.name} ${vb}`);
      // The verdict alone cannot tell a seed from a taint casualty, and both of
      // those are "run". Where both implementations report the tentative
      // verdict and the edge, compare them: that is where J3 actually lives.
      if (ra.tentative && rb.tentative && ra.tentative[path] !== rb.tentative[path]) {
        dis.push(`${f.id} ${path}: tentative — ${a.name} ${ra.tentative[path] ?? "none"}, ${b.name} ${rb.tentative[path] ?? "none"}`);
      }
      if (ra.taintedBy && rb.taintedBy && ra.taintedBy[path] !== rb.taintedBy[path]) {
        dis.push(`${f.id} ${path}: tainted by — ${a.name} ${ra.taintedBy[path] ?? "nothing"}, ${b.name} ${rb.taintedBy[path] ?? "nothing"}`);
      }
    }
    // F-Rule-Equivalence, across implementations: the same host rules over
    // the same source report the same findings, whichever path each took.
    if (f.findings) {
      const [fa, fb] = await Promise.all([collectFindings(a, f), collectFindings(b, f)]);
      if (fa !== "unavailable" && fb !== "unavailable") {
        const sig = (m: Map<string, Finding[]>) => [...m.entries()].flatMap(([k, xs]) => xs.map((x) => `${k}: ${findingSig(x)}`)).sort().join("\n");
        if (sig(fa) !== sig(fb)) dis.push(`${f.id}: findings — ${a.name}\n${sig(fa)}\n${b.name}\n${sig(fb)}`);
      }
    }
  }
  for (const f of expressionFixtures(fixtures)) {
    const ra = a.foldExport(f.input, f.exportName), rb = b.foldExport(f.input, f.exportName);
    if (ra.ok !== rb.ok) dis.push(`${f.id}: ${a.name} ${ra.ok ? "folds" : "runs"}, ${b.name} ${rb.ok ? "folds" : "runs"}`);
    else if (ra.ok && rb.ok && encodeValue(ra.value) !== encodeValue(rb.value)) dis.push(`${f.id}: values differ — ${a.name} ${encodeValue(ra.value)} vs ${b.name} ${encodeValue(rb.value)}`);
    const sa = a.shape(f.input, f.exportName), sb = b.shape(f.input, f.exportName);
    if (sa !== "unavailable" && sb !== "unavailable" && sa.accepted !== sb.accepted) dis.push(`${f.id}: shape — ${a.name} ${sa.accepted ? "accepts" : "rejects"}, ${b.name} ${sb.accepted ? "accepts" : "rejects"}`);
  }
  return dis;
}
