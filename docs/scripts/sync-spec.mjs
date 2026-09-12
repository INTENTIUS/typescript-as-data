// Generate docs/src/content/docs/spec/*.md from ../spec/*.md, and
// docs/src/data/figures.json from the artifacts every figure on the site
// comes from (spec/VERSION, the chant pin, the corpus report, the fixture
// tree). A page reads a figure from that file; it never types one, so a bump
// is one edit and no page quietly names the previous number (#85).
// spec/*.md is normative; this directory is build output and is gitignored.
// Anchors: every heading that starts with a rule or row identifier
// (R3.3, R-spec.3, L3.10) gets an explicit <a id> so citations are stable
// across heading-text edits.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const specDir = join(here, "..", "..", "spec");
const outDir = join(here, "..", "src", "content", "docs", "spec");
const dataDir = join(here, "..", "src", "data");

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
const ORDER = ["README", "grammar", "judgments", "values", "divergence", "hosts", "rules", "inventory", "CHANGELOG", "prior-art"];

for (const file of readdirSync(specDir).filter((f) => f.endsWith(".md"))) {
  const name = basename(file, ".md");
  const src = readFileSync(join(specDir, file), "utf8");
  const lines = src.split("\n");
  let title = name;
  const body = [];
  let seenH1 = false;
  for (const ln of lines) {
    if (!seenH1 && /^#\s+/.test(ln)) { title = ln.replace(/^#\s+/, "").trim(); seenH1 = true; continue; }
    const m = ID.exec(ln) || BOLD_ID.exec(ln);
    if (m) body.push(`<a id="${m[2] ?? m[1]}"></a>`);
    body.push(ln);
  }
  const desc = (body.find((l) => l.trim() && !l.startsWith("#") && !l.startsWith("<a") && !l.startsWith("|") && !l.startsWith(">")) ?? "").replace(/[`*_]/g, "").slice(0, 160);
  const order = ORDER.indexOf(name);
  const fm = [
    "---",
    `title: ${JSON.stringify(name === "README" ? "Specification" : title)}`,
    `description: ${JSON.stringify(desc)}`,
    `sidebar:\n  order: ${order === -1 ? 99 : order}`,
    "---",
    "",
    `<!-- GENERATED from spec/${file} by docs/scripts/sync-spec.mjs — edit the source, not this file. -->`,
    "",
  ].join("\n");
  writeFileSync(join(outDir, `${name === "README" ? "index" : name}.md`), fm + body.join("\n"));
  console.log(`spec/${file} -> spec/${name === "README" ? "index" : name}.md`);
}

// ── figures.json ────────────────────────────────────────────────────────────
const root = join(here, "..", "..");
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const specVersion = readFileSync(join(specDir, "VERSION"), "utf8").trim();
const chantPin = json(join(root, "package.json")).devDependencies["@intentius/chant"];
const referenceVersion = json(join(root, "packages", "reference", "package.json")).version;
const conformanceVersion = json(join(root, "packages", "conformance", "package.json")).version;
const uncovered = readFileSync(join(specDir, "fixtures", "UNCOVERED.md"), "utf8");
const cov = /(\d+) of (\d+) rules have fixtures/.exec(uncovered);
const fixtureDirs = readdirSync(join(specDir, "fixtures"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => readdirSync(join(specDir, "fixtures", d.name), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(specDir, "fixtures", d.name, e.name)));
const wholeBuild = fixtureDirs.filter((d) => { try { return json(join(d, "expect.json")).project === true; } catch { return false; } }).length;
let corpus = null;
try {
  const report = readFileSync(join(root, "packages", "conformance", "corpus-report.md"), "utf8");
  const rev = /corpus: chant `([^`]+)` at `([^`]+)`, (\d+) entries, (\d+) files/.exec(report);
  // Two limits since #96; the two chant-side ones are gone from the report.
  const totals = /\n\| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|/.exec(report);
  const declared = /declaring spec `([^`]+)`/.exec(report);
  if (rev && totals) corpus = { corpusVersion: rev[1], revision: rev[2], entries: +rev[3], files: +totals[1], comparable: +totals[2], agreed: +totals[3], bothFold: +totals[4], noHost: +totals[5], noComposite: +totals[6], chantDeclares: declared ? declared[1] : null };
} catch {}
mkdirSync(dataDir, { recursive: true });
const figures = { specVersion, chantPin, referenceVersion, conformanceVersion, rulesWithFixture: cov ? +cov[1] : null, rulesTotal: cov ? +cov[2] : null, fixtures: fixtureDirs.length, wholeBuildFixtures: wholeBuild, corpus };
writeFileSync(join(dataDir, "figures.json"), JSON.stringify(figures, null, 2) + "\n");
console.log("figures.json:", JSON.stringify(figures));
