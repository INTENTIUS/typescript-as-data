// Write docs/data/figures.json from the artifacts every figure on the site
// comes from (spec/VERSION, the chant pin, the corpus report, the fixture
// tree). A page reads a figure from that file; it never types one, so a bump
// is one edit and no page quietly names the previous number (#85).
// The specification itself is not on the site; pages link to spec/*.md on GitHub.
import { statSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureCounts, coverageCounts } from "../../scripts/lib/figures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const specDir = join(here, "..", "..", "spec");
const dataDir = join(here, "..", "data");

// ── figures.json ────────────────────────────────────────────────────────────
const root = join(here, "..", "..");
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const specVersion = readFileSync(join(specDir, "VERSION"), "utf8").trim();
const chantPin = json(join(root, "package.json")).devDependencies["@intentius/chant"];
const referenceVersion = json(join(root, "packages", "reference", "package.json")).version;
const conformanceVersion = json(join(root, "packages", "conformance", "package.json")).version;
// Counted in scripts/lib/figures.mjs, which spec/figures.test.ts also reads,
// so the site's figures and the gate on the prose share one definition (#174).
const { rulesWithFixture, rulesTotal } = coverageCounts(specDir);
const { fixtures, wholeBuildFixtures } = fixtureCounts(specDir);
let corpus = null;
try {
  const report = readFileSync(join(root, "packages", "conformance", "corpus-report.md"), "utf8");
  const rev = /corpus: chant `([^`]+)` at `([^`]+)`, (\d+) entries, (\d+) files/.exec(report);
  // Two limits: `host` and, since #129, `invocation`; the chant-side pair went with #96 and the composite one with #109.
  const totals = /\n\| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|/.exec(report);
  const declared = /declaring spec `([^`]+)`/.exec(report);
  // The data-host column (#86): present when the report was taken with the Rust evaluator built.
  const column = /## The data-host column\n\n- evaluator: `([^`]+)`[^\n]*\n\n\| Files \| Agreed \| Both fold \|\n\|[-|]+\|\n\| (\d+) \| (\d+) \| (\d+) \|/.exec(report);
  const dataHost = column ? { evaluator: column[1], files: +column[2], agreed: +column[3], bothFold: +column[4] } : null;
  // The isolation column (#171): what refusing every project-owned invocation costs in coverage.
  const iso = /## The isolation column\n[\s\S]*?\| Files \| Folds under `open` \| Folds under `isolated` \| Lost to isolation \|\n\|[-|]+\|\n\| (\d+) \| (\d+) \| (\d+) \| (\d+) \|/.exec(report);
  const isolated = iso ? { files: +iso[1], openFolds: +iso[2], isolatedFolds: +iso[3], lost: +iso[4] } : null;
  if (rev && totals) corpus = { corpusVersion: rev[1], revision: rev[2], entries: +rev[3], files: +totals[1], comparable: +totals[2], agreed: +totals[3], bothFold: +totals[4], noHost: +totals[5], noInvocation: +totals[6], chantDeclares: declared ? declared[1] : null, dataHost, isolated };
} catch {}
// The provenance column (#237): every emitted field by origin, from its own
// artifact, which is written only by a run whose chant reports provenance.
let provenance = null;
try {
  const report = readFileSync(join(root, "packages", "conformance", "provenance-report.md"), "utf8");
  const rev = /corpus: chant `([^`]+)` at `([^`]+)`, (\d+) entries, (\d+) files/.exec(report);
  const row = (verdict) => {
    const m = new RegExp(`\\n\\| ${verdict} \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| ([\\d.]+%|n/a) \\| ([\\d.]+%|n/a) \\|`).exec(report);
    return m ? { files: +m[1], entities: +m[3], fields: +m[4], direct: +m[5], parameter: +m[6], literal: +m[7], unknown: +m[8], knownShare: m[9], compositeKnownShare: m[10] } : null;
  };
  // Unknown because a composite expanded the entity without its body being interpreted, per verdict: the denominator of the composite share.
  const ni = /\| `composite-not-interpreted` \| (\d+) \| (\d+) \|/.exec(report);
  const notInterpreted = { fold: ni ? +ni[1] : 0, run: ni ? +ni[2] : 0 };
  notInterpreted.all = notInterpreted.fold + notInterpreted.run;
  const derive = (r, k) => r && { ...r, known: r.direct + r.parameter + r.literal, compositeKnown: r.parameter + r.literal, compositeFields: r.parameter + r.literal + notInterpreted[k] };
  const fold = derive(row("fold"), "fold"), run = derive(row("run"), "run"), all = derive(row("all"), "all");
  if (rev && fold && run && all) provenance = { corpusVersion: rev[1], revision: rev[2], fold, run, all };
} catch {}
mkdirSync(dataDir, { recursive: true });
// The evaluator's WebAssembly module, when scripts/build-wasm.sh has run: its size in kilobytes, so the page that loads it can say what it is asking the reader to download.
let wasmKB = null;
try { wasmKB = Math.round(statSync(join(root, "docs", "static", "tsad-eval", "tsad-eval.wasm")).size / 1024); } catch {}
// The F-NoOwnExecution recording (#178): an exact ledger of everything the
// reference invokes while folding, with the rule that admits each one. Read
// as JSON rather than slurped out of a report, which is #190's lesson.
let execution = null;
try {
  const r = json(join(root, "packages", "reference", "no-own-execution.json"));
  const panel = (id) => r.panels.find((p) => p.id === id);
  execution = {
    dataHostFixtures: panel("A").fixtures,
    foldingFixtures: panel("B").fixtures,
    foldingInvocations: panel("B").invocations,
    mixedFixtures: panel("C").fixtures,
    mixedInvocations: panel("C").invocations,
    invocations: r.panels.reduce((n, p) => n + p.invocations, 0),
    arms: Object.keys(r.arms.reached).length,
    unmapped: r.panels.reduce((n, p) => n + p.failures.length, 0),
  };
} catch {}
// #192 — the flagship consumer's own declared specification version, written
// by the weekly demo from warden's installed evaluator. Absent until a demo
// run has happened, like the corpus report.
let consumer = null;
try {
  const r = json(join(dataDir, "consumer-skew.json"));
  consumer = { name: r.consumer.name, declares: r.consumer.declares, evaluator: r.consumer.evaluator, skew: r.skew.kind, date: r.date };
} catch {}
const figures = { specVersion, chantPin, referenceVersion, conformanceVersion, rulesWithFixture, rulesTotal, fixtures, wholeBuildFixtures, corpus, provenance, execution, consumer, wasmKB };
writeFileSync(join(dataDir, "figures.json"), JSON.stringify(figures, null, 2) + "\n");
console.log("figures.json:", JSON.stringify(figures));
