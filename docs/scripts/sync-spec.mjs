// Generate docs/src/content/docs/spec/*.md from ../spec/*.md.
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
const ORDER = ["README", "grammar", "judgments", "values", "divergence", "hosts", "inventory", "CHANGELOG", "prior-art"];

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
