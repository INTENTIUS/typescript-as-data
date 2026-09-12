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
  type ChantCheckout, type CorpusSummary, type EntryReport,
} from "./corpus";

const checkout = findChantCheckout();

describe.skipIf(!checkout)("the corpus against both implementations (#25)", () => {
  let reports: EntryReport[];
  let summary: CorpusSummary;

  beforeAll(async () => {
    const entries = await discoverCorpus(checkout as ChantCheckout);
    reports = [];
    for (const entry of entries) reports.push(await runCorpusEntry(checkout as ChantCheckout, entry));
    summary = summarize(reports);
    if (process.env.TSAD_CORPUS_REPORT) {
      const out = resolve(dirname(fileURLToPath(import.meta.url)), "..", "corpus-report.md");
      writeFileSync(out, renderCorpusReport(checkout as ChantCheckout, { name: chantAdapter.name, specVersion: chantAdapter.specVersion }, summary, reports), "utf8");
    }
  }, 600_000);

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

  test("the reference never folds what chant runs", () => {
    // The asymmetry is the point: both limits are the reference's and can only
    // make it refuse more. A fold it reaches and chant does not is a real
    // disagreement wherever it appears.
    const lines = summary.referenceMorePermissive.map((d) => `${d.entry}/${d.file}: ${d.chantReason ?? ""}`);
    expect(lines, lines.join("\n")).toEqual([]);
  });
});
