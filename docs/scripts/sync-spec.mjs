// Generate docs/content/spec/normative/*.md from ../spec/*.md, and
// docs/data/figures.json from the artifacts every figure on the site
// comes from (spec/VERSION, the chant pin, the corpus report, the fixture
// tree). A page reads a figure from that file; it never types one, so a bump
// is one edit and no page quietly names the previous number (#85).
// spec/*.md is normative; this directory is build output and is gitignored.
// Anchors: every heading that starts with a rule or row identifier
// (R3.3, R-spec.3, L3.10) gets an explicit <a id> so citations are stable
// across heading-text edits.
import { statSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureCounts, coverageCounts } from "../../scripts/lib/figures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const specDir = join(here, "..", "..", "spec");
const outDir = join(here, "..", "content", "spec", "normative");
const dataDir = join(here, "..", "data");
const SITE = "/typescript-as-data/spec/normative";

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// Only genuine identifiers: R<n>, R<n>.<m>, L<n>.<m>. A word starting with R
// ("Requirements", "Read") must not become an anchor.
const ID = /^(#{1,6})\s+((?:[SF]-[A-Za-z0-9-]+|L\d+\.\d+))\b(.*)$/;
// Rules written as bold-leading paragraphs ("**F-Eval-Ident.**", "**S-Module.**")
// get an anchor too, so a citation resolves whether the rule is a heading or not.
const BOLD_ID = /^\*\*((?:[SF]-[A-Za-z0-9-]+))[.\s]/;
// Sidebar order. The set of files is whatever spec/ holds; this list only says
// where a known one sorts, and anything unlisted falls to the end. CHANGELOG is
// listed ahead of its arrival (#18): spec/CHANGELOG.md does not exist yet, and
// naming it here is inert until it does, because the loop below iterates the
// directory rather than this list.
const ORDER = ["README", "objective", "grammar", "judgments", "evaluation", "verdict", "taint", "observables", "values", "divergence", "hosts", "rules", "rationale", "inventory", "CHANGELOG", "prior-art"];

for (const file of readdirSync(specDir).filter((f) => f.endsWith(".md"))) {
  const name = basename(file, ".md");
  const src = readFileSync(join(specDir, file), "utf8");
  const lines = src.split("\n");
  let title = name;
  const body = [];
  let seenH1 = false;
  for (const raw of lines) {
    if (!seenH1 && /^#\s+/.test(raw)) { title = raw.replace(/^#\s+/, "").trim(); seenH1 = true; continue; }
    // A link to a sibling file (`./grammar.md`) becomes the page it renders as.
    const ln = raw.replace(/\]\(\.\/([A-Za-z-]+)\.md(#[^)]*)?\)/g, (_, n, h) => `](${SITE}/${n === "README" ? "" : n.toLowerCase() + "/"}${h ?? ""})`)
      .replace(/\]\(\.\/VERSION\)/g, "](https://github.com/INTENTIUS/typescript-as-data/blob/main/spec/VERSION)");
    const m = ID.exec(ln) || BOLD_ID.exec(ln);
    if (m) body.push(`<a id="${m[2] ?? m[1]}"></a>`);
    body.push(ln);
  }
  const desc = (body.find((l) => l.trim() && !l.startsWith("#") && !l.startsWith("<a") && !l.startsWith("|") && !l.startsWith(">")) ?? "").replace(/[`*_]/g, "").slice(0, 160);
  const order = ORDER.indexOf(name);
  const fm = [
    "---",
    `title: ${JSON.stringify(name === "README" ? "Normative text" : title)}`,
    `description: ${JSON.stringify(desc)}`,
    `weight: ${order === -1 ? 99 : order + 1}`,
    ...(name === "README" ? ["hideChildren: false", 'aliases: ["/spec/"]'] : [`aliases: ["/spec/${name.toLowerCase()}/"]`]),
    "---",
    "",
    `<!-- GENERATED from spec/${file} by docs/scripts/sync-spec.mjs. Edit the source, not this file. -->`,
    "",
  ].join("\n");
  const out = name === "README" ? "_index.md" : `${name.toLowerCase()}.md`;
  writeFileSync(join(outDir, out), fm + body.join("\n"));
  console.log(`spec/${file} -> content/spec/normative/${out}`);
}

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
mkdirSync(dataDir, { recursive: true });
// The evaluator's WebAssembly module, when scripts/build-wasm.sh has run: its size in kilobytes, so the page that loads it can say what it is asking the reader to download.
let wasmKB = null;
try { wasmKB = Math.round(statSync(join(root, "docs", "static", "tsad-eval", "tsad-eval.wasm")).size / 1024); } catch {}
const figures = { specVersion, chantPin, referenceVersion, conformanceVersion, rulesWithFixture, rulesTotal, fixtures, wholeBuildFixtures, corpus, wasmKB };
writeFileSync(join(dataDir, "figures.json"), JSON.stringify(figures, null, 2) + "\n");
console.log("figures.json:", JSON.stringify(figures));
