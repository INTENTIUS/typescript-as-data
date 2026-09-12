import type { ConformanceAdapter } from "./adapter";
import type { ExpressionFixture, Fixture, ProjectFixture } from "./fixture";
import { expressionFixtures, projectFixtures } from "./fixture";
import { requireHost } from "./host";

export interface FixtureReport { fixture: string; adapter: string; pass: boolean; skipped?: string; failures: string[] }

export function runFixture(adapter: ConformanceAdapter, f: ExpressionFixture): FixtureReport {
  const failures: string[] = []; let skipped: string | undefined;
  const s = adapter.shape(f.input, f.exportName);
  if (s === "unavailable") skipped = "shape classifier unavailable";
  else if (s.accepted !== (f.shape === "accept")) failures.push(`shape: expected ${f.shape}, got ${s.accepted ? "accept" : `reject (${s.message})`}`);
  const r = adapter.foldExport(f.input, f.exportName);
  if (f.fold === "fold") {
    if (!r.ok) failures.push(`fold: expected fold, got run (${r.message})`);
    else if (f.value === "$undefined") { if (r.value !== undefined) failures.push(`fold: value ${JSON.stringify(r.value)} ≠ expected undefined`); }
    else if (JSON.stringify(r.value) !== JSON.stringify(f.value)) failures.push(`fold: value ${JSON.stringify(r.value)} ≠ expected ${JSON.stringify(f.value)}`);
  } else {
    if (r.ok) failures.push(`fold: expected run, got fold with ${JSON.stringify(r.value)}`);
    else if (f.rejectAt && (r.line !== f.rejectAt.line || r.column !== f.rejectAt.column))
      failures.push(`fold: rejection at ${r.line}:${r.column}, expected ${f.rejectAt.line}:${f.rejectAt.column}`);
  }
  return { fixture: f.id, adapter: adapter.name, pass: failures.length === 0, skipped, failures };
}
export function runFixtures(adapter: ConformanceAdapter, fixtures: Fixture[]): FixtureReport[] {
  return [
    ...expressionFixtures(fixtures).map((f) => runFixture(adapter, f)),
    ...projectFixtures(fixtures).map((f) => runProjectFixture(adapter, f)),
  ];
}

/** #24 — a whole-build fixture. J3's edges are invisible in any single file, so this is the only shape that can test them. */
export function runProjectFixture(adapter: ConformanceAdapter, f: ProjectFixture): FixtureReport {
  const base = { fixture: f.id, adapter: adapter.name };
  if (!adapter.foldProject) return { ...base, pass: true, skipped: "no project entry", failures: [] };
  const r = adapter.foldProject(f.files, f.host ? requireHost(f.host) : undefined);
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
  for (const [path, want] of Object.entries(f.exports ?? {})) {
    const got = r.verdicts[path];
    if (got?.kind !== "fold") { failures.push(`${path}: expected exports, but the file did not fold`); continue; }
    for (const [name, value] of Object.entries(want)) {
      if (JSON.stringify(got.exports[name]) !== JSON.stringify(value)) {
        failures.push(`${path}: export ${name} = ${JSON.stringify(got.exports[name])} ≠ expected ${JSON.stringify(value)}`);
      }
    }
  }
  return { ...base, pass: failures.length === 0, failures };
}

/** #11 — two implementations must agree on every fixture, independently of what the fixture expects. */
export function compareAdapters(a: ConformanceAdapter, b: ConformanceAdapter, fixtures: Fixture[]): string[] {
  const dis: string[] = [];
  for (const f of projectFixtures(fixtures)) {
    if (!a.foldProject || !b.foldProject) continue;
    const host = f.host ? requireHost(f.host) : undefined;
    const ra = a.foldProject(f.files, host), rb = b.foldProject(f.files, host);
    if (ra === "unavailable" || rb === "unavailable") continue;
    for (const path of new Set([...Object.keys(ra.verdicts), ...Object.keys(rb.verdicts)])) {
      const va = ra.verdicts[path]?.kind ?? "absent", vb = rb.verdicts[path]?.kind ?? "absent";
      if (va !== vb) dis.push(`${f.id} ${path}: ${a.name} ${va}, ${b.name} ${vb}`);
    }
  }
  for (const f of expressionFixtures(fixtures)) {
    const ra = a.foldExport(f.input, f.exportName), rb = b.foldExport(f.input, f.exportName);
    if (ra.ok !== rb.ok) dis.push(`${f.id}: ${a.name} ${ra.ok ? "folds" : "runs"}, ${b.name} ${rb.ok ? "folds" : "runs"}`);
    else if (ra.ok && rb.ok && JSON.stringify(ra.value) !== JSON.stringify(rb.value)) dis.push(`${f.id}: values differ — ${a.name} ${JSON.stringify(ra.value)} vs ${b.name} ${JSON.stringify(rb.value)}`);
    const sa = a.shape(f.input, f.exportName), sb = b.shape(f.input, f.exportName);
    if (sa !== "unavailable" && sb !== "unavailable" && sa.accepted !== sb.accepted) dis.push(`${f.id}: shape — ${a.name} ${sa.accepted ? "accepts" : "rejects"}, ${b.name} ${sb.accepted ? "accepts" : "rejects"}`);
  }
  return dis;
}
