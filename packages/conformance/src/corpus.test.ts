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
import { countOrigins, summarizeProvenance, renderProvenanceSection, knownShare, compositeKnownShare, projectCompositeNames, renderProvenanceReport, type FileOrigins } from "./corpus";
import { chantAdapter } from "./adapters/chant";
import {
  findChantCheckout, discoverCorpus, runCorpusEntry, summarize, renderCorpusReport,
  findExternalCheckouts, discoverExternal,
  type ChantCheckout, type CorpusSummary, type EntryReport, type ExternalRun,
  isolationRefusalOf, addOracleColumn,
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
    // #233: the checker column, one tsc batch over every entry, resolving packages from the checkout.
    reports = addOracleColumn(reports, { nodeModules: resolve((checkout as ChantCheckout).root, "node_modules") });
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
      // #237: the provenance column on its own, written only when the chant under test reports provenance.
      const provenance = renderProvenanceReport(checkout as ChantCheckout, { name: chantAdapter.name, specVersion: chantAdapter.specVersion }, reports, external);
      if (provenance) writeFileSync(resolve(dirname(out), "provenance-report.md"), provenance, "utf8");
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

  test("the checker column is present and no export fails it (#233)", () => {
    expect(summary.oracle, "no checker column").toBeDefined();
    expect(summary.oracle!.exports - summary.oracle!.outOfScope).toBeGreaterThan(0);
    const lines = summary.oracle!.failures.map((f) => `${f.entry}/${f.file}#${f.exportName}: ${f.diagnostics.join(" | ")}`);
    expect(lines, lines.join("\n")).toEqual([]);
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

/**
 * The provenance column (#237) on a corpus written here, so it runs without
 * a chant checkout. The records are in chant's `FoldProvenance` shape; the
 * reports are what `runCorpusEntry` returns for files carrying them.
 */
describe("the provenance column on a synthetic corpus (#237)", () => {
  const fromFold = (record: Parameters<typeof countOrigins>[0], pkg: string[] = []): FileOrigins => ({ from: "fold", ...countOrigins(record, new Set(pkg)) });
  const store = fromFold({
    storeBucket: { composite: "Store", instance: "store", fields: { name: { kind: "composite-parameter" }, versioning: { kind: "composite-literal" }, tags: { kind: "composite-parameter" } } },
    storeTable: { composite: "Store", instance: "store", fields: { name: { kind: "composite-parameter" }, billing: { kind: "unknown", reason: "composite-not-interpreted" } } },
  }, ["Store"]);
  const direct = fromFold({ b: { fields: { name: { kind: "direct" }, "tags.team": { kind: "direct" } } }, empty: { fields: {} } });
  const ran: FileOrigins = { from: "build", ...countOrigins({ q: { composite: "Queue", instance: "q", fields: { name: { kind: "unknown", reason: "composite-not-interpreted" }, size: { kind: "unknown", reason: "no-provenance" } } } }, new Set(["Store"])) };
  const reports: EntryReport[] = [{
    name: "app",
    files: 5,
    comparisons: [
      { file: "store.ts", chant: "fold", reference: "fold", origins: store },
      { file: "direct.ts", chant: "fold", reference: "fold", origins: direct },
      // A fold whose entities could not be collected carries no record and is not read as direct.
      { file: "dup.ts", chant: "fold", reference: "fold" },
      { file: "queue.ts", chant: "run", reference: "run", origins: ran },
      { file: "broken.ts", chant: "run", reference: "run", originsUnavailable: "boom" },
    ],
  }];

  test("a record is counted by kind, unknowns by reason, and an entity with no fields is not an entity", () => {
    expect(store).toEqual({ from: "fold", entities: 2, direct: 0, parameter: 3, literal: 1, unknown: { "composite-not-interpreted": 1 }, unknownByComposite: { "Store (project)": 1 } });
    expect(ran.unknownByComposite).toEqual({ "Queue (package)": 2 });
    expect(direct).toMatchObject({ entities: 1, direct: 2 });
    expect(countOrigins({ e: { fields: { x: { kind: "sideways" } } } }).unknown).toEqual({ "kind sideways": 1 });
  });

  test("files that fold and files that run are summed apart", () => {
    const s = summarizeProvenance(reports);
    expect(s.fold).toEqual({ files: 3, withRecord: 2, counts: { entities: 3, direct: 2, parameter: 3, literal: 1, unknown: { "composite-not-interpreted": 1 }, unknownByComposite: { "Store (project)": 1 } } });
    expect(s.run).toMatchObject({ files: 2, withRecord: 1, counts: { entities: 1, direct: 0, parameter: 0, literal: 0, unknown: { "composite-not-interpreted": 1, "no-provenance": 1 } }, unavailable: ["app: boom"] });
    // 6 of 7 fold fields have a known origin; 4 of the 5 a composite expanded do.
    expect(knownShare(s.fold.counts)).toBe("85.7%");
    expect(compositeKnownShare(s.fold.counts)).toBe("80.0%");
  });

  test("the report renders totals, reasons and the per-file rows", () => {
    const md = renderProvenanceSection(reports).join("\n");
    expect(md).toContain("## The provenance column");
    expect(md).toContain("| fold | 3 | 2 | 3 | 7 | 2 | 3 | 1 | 1 | 85.7% | 80.0% |");
    expect(md).toContain("| run | 2 | 1 | 1 | 2 | 0 | 0 | 0 | 2 | 0.0% | 0.0% |");
    expect(md).toContain("| `composite-not-interpreted` | 1 | 1 |");
    expect(md).toContain("| `no-provenance` | 0 | 1 |");
    expect(md).toContain("- app: boom");
    expect(md).toContain("| `Queue (package)` | 0 | 2 |\n| `Store (project)` | 1 | 0 |");
    expect(md).toContain("| `app/store.ts` | fold | 2 | 5 | 0 | 3 | 1 | 1 | composite-not-interpreted 1 |");
    // And the whole report carries it.
    const whole = renderCorpusReport({ root: "/x", corpusVersion: "0.0.0", revision: "abc" }, { name: "chant", specVersion: "2.2" }, summarize(reports), reports);
    expect(whole).toContain("## The provenance column");
  });

  test("a composite is the project's when its source names it to Composite, and a package's otherwise", () => {
    const names = projectCompositeNames(new Map([
      ["store.ts", 'import { Composite } from "@intentius/chant";\nexport const Store = Composite((p) => ({}), "Store");\nconst Inner = Composite((p) => ({}));\n'],
      ["app.ts", 'import { ArgoAppFor } from "@intentius/chant-lexicon-k8s";\nexport const web = ArgoAppFor("web", {});\n'],
    ]));
    expect([...names].sort()).toEqual(["Store", "anonymous"]);
  });

  test("a corpus with no record anywhere renders no section and no report", () => {
    const none: EntryReport[] = [{ name: "x", files: 1, comparisons: [{ file: "a.ts", chant: "fold", reference: "fold" }] }];
    expect(renderProvenanceSection(none)).toEqual([]);
    expect(renderProvenanceReport({ root: "/x", corpusVersion: "0.0.0", revision: "abc" }, { name: "chant", specVersion: "2.2" }, none)).toBeUndefined();
    expect(renderProvenanceReport({ root: "/x", corpusVersion: "0.0.0", revision: "abc" }, { name: "chant", specVersion: "2.2" }, reports)).toContain("- corpus: chant `0.0.0` at `abc`, 1 entries, 5 files");
  });
});

/**
 * The isolation refusal classifier (#171), outside the skip above: it reads
 * strings rather than a chant checkout, so it runs everywhere. The wordings
 * here are chant's own, built by `sandboxedExecutionRefusal` from a `what` of
 * "composite factory", "constructor" or "import".
 */
describe("isolation refusals are classified by what chant refused (#171)", () => {
  test("each of chant's three wordings, and anything else", () => {
    expect(isolationRefusalOf('composite factory "prodConverge" is imported from "./ops", which is neither chant\'s own nor an active lexicon')).toBe("factory");
    expect(isolationRefusalOf('constructor "Repository" is imported from "./repo"')).toBe("constructor");
    expect(isolationRefusalOf('import "thing" is imported from "./x"')).toBe("import");
    expect(isolationRefusalOf("a wording this report does not know")).toBe("other");
    expect(isolationRefusalOf(undefined)).toBeUndefined();
  });

  test("an unknown wording is never put in a known bucket", () => {
    // The split is short by the unclassified count rather than wrong, which is
    // what keeps a chant rewording visible instead of silently miscounted.
    for (const r of ["refused", "project code", "sandbox", ""]) {
      expect(isolationRefusalOf(r) === "factory" || isolationRefusalOf(r) === "constructor").toBe(false);
    }
  });
});

/**
 * The checker column's own path (#233), on a corpus of two entries written
 * here, so it runs without a chant checkout. The entries' reports are what
 * `runCorpusEntry` would return for them: comparisons, plus the sources and
 * the reference's folds the column reads.
 */
describe("the checker column on a synthetic corpus (#233)", () => {
  const entry = (name: string, sources: Record<string, string>, folds: Record<string, Record<string, unknown>>): EntryReport => ({
    name,
    files: Object.keys(sources).length,
    comparisons: Object.keys(sources).map((file) => ({ file, chant: folds[file] ? "fold" : "run", reference: folds[file] ? "fold" : "run" })),
    oracleInput: { sources: new Map(Object.entries(sources)), folds: new Map(Object.entries(folds)) },
  });
  const reports = addOracleColumn([
    entry(
      "service",
      {
        "defaults.ts": `export const labels = { team: "platform" };\nexport const port = 8080;\n`,
        "app.ts": `import { labels, port } from "./defaults";\nexport const service = { labels, port, replicas: 2 * 2 };\n`,
        "runs.ts": `export const bucket = new Bucket({});\n`,
      },
      {
        "defaults.ts": { labels: { team: "platform" }, port: 8080 },
        "app.ts": { service: { labels: { team: "platform" }, port: 8080, replicas: 4 } },
      },
    ),
    entry("wrong", { "config.ts": `export default { target: "es5" };\n` }, { "config.ts": { default: { target: "esnext" } } }),
  ]);
  const summary = summarize(reports);

  test("each folded file carries the column, and a file that runs does not", () => {
    const service = reports[0].comparisons;
    expect(service.find((c) => c.file === "defaults.ts")?.oracle?.map((o) => [o.exportName, o.verdict])).toEqual([["labels", "pass"], ["port", "pass"]]);
    expect(service.find((c) => c.file === "app.ts")?.oracle?.[0]).toMatchObject({ verdict: "unchecked", uncheckedPaths: ["$.replicas"], leaves: 3, checkedLeaves: 2 });
    expect(service.find((c) => c.file === "runs.ts")?.oracle).toBeUndefined();
  });

  test("the summary counts verdicts and coverage, and lists the failure by entry", () => {
    expect(summary.oracle).toMatchObject({ files: 3, exports: 4, outOfScope: 0, pass: 2, unchecked: 1, leaves: 6, checkedLeaves: 5 });
    expect(summary.oracle!.failures.map((f) => `${f.entry}/${f.file}#${f.exportName}`)).toEqual(["wrong/config.ts#default"]);
  });

  test("the report renders the column", () => {
    const md = renderCorpusReport({ root: "/x", corpusVersion: "0.0.0", revision: "abc" }, { name: "chant", specVersion: "2.1" }, summary, reports);
    expect(md).toContain("## The checker column");
    expect(md).toContain("| 3 | 4 | 0 | 2 | 1 | 1 | 5 of 6 leaves (83.3%) |");
    expect(md).toMatch(/- `wrong\/config.ts` export `default`: TS2322/);
  });
});
