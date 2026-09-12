import type { ConformanceAdapter } from "./adapter.js";
import type { ExpressionFixture, Fixture, ProjectFixture } from "./fixture.js";
import { expressionFixtures, projectFixtures } from "./fixture.js";
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
  ];
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
  return { ...base, pass: failures.length === 0, failures };
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
