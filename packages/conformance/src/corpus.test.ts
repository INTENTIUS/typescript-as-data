/**
 * #25 — chant's whole example corpus through both implementations.
 *
 * The suite skips unless `TSAD_CHANT_REPO` names a chant checkout to read the
 * corpus from, because the corpus is not in this repository and not in the
 * published package. The skip is reported, not silent. `npm run corpus` also
 * writes `packages/conformance/corpus-report.md`, which is the artifact the
 * paper cites; the number there is taken with the checkout at the pinned tag.
 */
import { describe, test, expect, beforeAll } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chantAdapter } from "./adapters/chant";
import {
  findChantCheckout, discoverCorpus, runCorpusEntry, summarize, renderCorpusReport,
  findExternalCheckouts, discoverExternal,
  type ChantCheckout, type CorpusSummary, type EntryReport, type ExternalRun,
} from "./corpus";

const checkout = findChantCheckout();
const externalCheckouts = findExternalCheckouts();

describe.skipIf(!checkout)("the corpus against both implementations (#25)", () => {
  let reports: EntryReport[];
  let summary: CorpusSummary;
  const external: ExternalRun[] = [];

  beforeAll(async () => {
    const entries = await discoverCorpus(checkout as ChantCheckout);
    reports = [];
    for (const entry of entries) reports.push(await runCorpusEntry(checkout as ChantCheckout, entry));
    summary = summarize(reports);
    // #129: codebases nobody here maintains, each its own row. A checkout the
    // manifest names and the directory lacks fails here by name rather than
    // shrinking the section.
    for (const ext of externalCheckouts ?? []) {
      expect(ext.headRevision, `${ext.name} is at ${ext.headRevision}, the manifest pins ${ext.rev}; run scripts/fetch-corpus-external.sh`).toBe(ext.rev);
      const found = await discoverExternal(checkout as ChantCheckout, ext);
      const runs: EntryReport[] = [];
      for (const entry of found) runs.push(await runCorpusEntry(checkout as ChantCheckout, entry));
      external.push({ checkout: ext, summary: summarize(runs), reports: runs });
    }
    if (process.env.TSAD_CORPUS_REPORT) {
      const out = resolve(dirname(fileURLToPath(import.meta.url)), "..", "corpus-report.md");
      writeFileSync(out, renderCorpusReport(checkout as ChantCheckout, { name: chantAdapter.name, specVersion: chantAdapter.specVersion }, summary, reports, external), "utf8");
    }
  }, 900_000);

  test("the data-host column is present and agrees (#86, #116)", () => {
    // A missing evaluator must not read as a clean pass: the column is asserted
    // unless a local run opts out of it by name, and then the report says so.
    if (!summary.dataHost) {
      expect(process.env.TSAD_CORPUS_NO_RUST, "no data-host column: build evaluators/rust (cargo build --release) or set TSAD_CORPUS_NO_RUST=1 to run the two-implementation comparison only").toBeTruthy();
      return;
    }
    const dis = summary.dataHost.disagreements.map((d) => `${d.entry}/${d.file}: reference ${d.dataHost!.reference}, evaluator ${d.dataHost!.rust} ${d.dataHost!.diff ?? ""}`);
    expect(dis, dis.join("\n")).toEqual([]);
    expect(summary.dataHost.files).toBe(summary.files);
  });

  test("the corpus is the whole one, not a fragment of it", () => {
    // A checkout whose dependencies are not installed, or a corpus discovery
    // that quietly returned less, would otherwise read as a clean run.
    expect(summary.entries).toBeGreaterThanOrEqual(100);
    expect(summary.files).toBeGreaterThanOrEqual(380);
  });

  test("every file is either comparable or limited by a named limit, and enough are comparable to mean something", () => {
    const limited = Object.values(summary.limited).reduce((n, c) => n + c, 0);
    expect(summary.comparable + limited).toBe(summary.files);
    // A run in which nothing is comparable agrees vacuously, which is what the
    // hostless first draft of this check did (#25). The floor is the guard.
    expect(summary.comparable).toBeGreaterThanOrEqual(50);
  });

  test("the two implementations agree on every comparable file", () => {
    const lines = summary.disagreements.map(
      (d) => `${d.entry}/${d.file}: chant=${d.chant} reference=${d.reference} values=${d.values ?? "-"} ${d.referenceRule ?? ""} ${d.referenceReason ?? d.chantReason ?? ""}`,
    );
    expect(lines, lines.join("\n")).toEqual([]);
  });

  test("codebases nobody here maintains are read, compared and agree (#129)", () => {
    // Skipped, reported, when TSAD_CORPUS_EXTERNAL is unset; the weekly job sets it.
    if (!externalCheckouts) { expect(process.env.TSAD_CORPUS_NO_EXTERNAL, "no external checkouts: set TSAD_CORPUS_EXTERNAL to the directory scripts/fetch-corpus-external.sh filled, or TSAD_CORPUS_NO_EXTERNAL=1 to skip the section").toBeTruthy(); return; }
    expect(external.map((x) => x.checkout.name)).toEqual(externalCheckouts.map((x) => x.name));
    for (const x of external) {
      expect(x.summary.files, `${x.checkout.name}: no files found`).toBeGreaterThan(0);
      expect(x.summary.comparable, `${x.checkout.name}: nothing comparable, so the row would agree vacuously`).toBeGreaterThan(0);
      // A disagreement the manifest triaged to an issue is excused by name and must still be there; one it did not is a failure.
      const known = x.checkout.disagreements ?? {};
      const seen = new Set(x.summary.disagreements.map((d) => `${d.entry}/${d.file}`));
      const gone = Object.keys(known).filter((k) => !seen.has(k));
      expect(gone, `${x.checkout.name}: triaged disagreements no longer disagree, drop them from corpus-external.json:\n${gone.join("\n")}`).toEqual([]);
      const lines = x.summary.disagreements.filter((d) => !known[`${d.entry}/${d.file}`]).map((d) => `${d.entry}/${d.file}: chant=${d.chant} reference=${d.reference} values=${d.values ?? "-"} ${d.referenceRule ?? ""} ${d.referenceReason ?? d.chantReason ?? ""}`);
      expect(lines, lines.join("\n")).toEqual([]);
      const wider = x.summary.referenceMorePermissive.map((d) => `${d.entry}/${d.file}: ${d.chantReason ?? ""}`);
      expect(wider, wider.join("\n")).toEqual([]);
    }
  });

  test("the reference never folds what chant runs", () => {
    // The asymmetry is the point: both limits are the reference's and can only
    // make it refuse more. A fold it reaches and chant does not is a real
    // disagreement wherever it appears.
    const lines = summary.referenceMorePermissive.map((d) => `${d.entry}/${d.file}: ${d.chantReason ?? ""}`);
    expect(lines, lines.join("\n")).toEqual([]);
  });
});
