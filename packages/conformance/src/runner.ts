import type { ConformanceAdapter } from "./adapter";
import type { Fixture } from "./fixture";

export interface FixtureReport { fixture: string; adapter: string; pass: boolean; skipped?: string; failures: string[] }

export function runFixture(adapter: ConformanceAdapter, f: Fixture): FixtureReport {
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
export function runFixtures(adapter: ConformanceAdapter, fixtures: Fixture[]): FixtureReport[] { return fixtures.map((f) => runFixture(adapter, f)); }

/** #11 — two implementations must agree on every fixture, independently of what the fixture expects. */
export function compareAdapters(a: ConformanceAdapter, b: ConformanceAdapter, fixtures: Fixture[]): string[] {
  const dis: string[] = [];
  for (const f of fixtures) {
    const ra = a.foldExport(f.input, f.exportName), rb = b.foldExport(f.input, f.exportName);
    if (ra.ok !== rb.ok) dis.push(`${f.id}: ${a.name} ${ra.ok ? "folds" : "runs"}, ${b.name} ${rb.ok ? "folds" : "runs"}`);
    else if (ra.ok && rb.ok && JSON.stringify(ra.value) !== JSON.stringify(rb.value)) dis.push(`${f.id}: values differ — ${a.name} ${JSON.stringify(ra.value)} vs ${b.name} ${JSON.stringify(rb.value)}`);
    const sa = a.shape(f.input, f.exportName), sb = b.shape(f.input, f.exportName);
    if (sa !== "unavailable" && sb !== "unavailable" && sa.accepted !== sb.accepted) dis.push(`${f.id}: shape — ${a.name} ${sa.accepted ? "accepts" : "rejects"}, ${b.name} ${sb.accepted ? "accepts" : "rejects"}`);
  }
  return dis;
}
