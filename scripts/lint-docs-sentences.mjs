// Prose lint for spec/*.md and README.md (copied from chant's scripts/lint-docs-sentences.mjs),
//
// Posture here: README.md, spec/README.md and spec/prior-art.md are prose and
// carry no real findings. Four baselined entries in them are heading-run
// artifacts: a table or bullet list between two headings blanks out, so the
// headings read as consecutive sentences opening with "##". A fifth, in
// paper/measurements.md, is a lone sentence between a table and a heading
// read as a fragment pair; it follows the position, not the words. A sixth,
// in paper/README.md, is the heading run again: the rule counts "##" lines
// whatever sits between them, so adding a sentence raised the count. Those
// six are the only tolerated findings in the prose and paper files. The rule files (grammar, judgments, values, divergence, hosts,
// inventory) are formal text: every rule opens with its identifier in bold,
// case analyses open with "If"/"with"/"otherwise", and definitions are short
// lines. The linter reads those as anaphora, fragments and colon reveals;
// they are structure, not tells. Those files are baselined and may only
// shrink, same ratchet as chant. on the `sentences` trope ruleset — the
// AI-writing tells (em-dash density, colon reveals, tricolons, anaphora,
// bold-first bullets, …) that tropes.fyi catalogues and the package detects
// per sentence with real parse trees, not regexes.
//
// Same posture as scripts/typecheck.ts: a RATCHET, not a purity gate. The
// docs corpus predates the linter; every existing finding is baselined
// per (file, rule) in scripts/docs-sentences-baseline.json, and this script
// fails only on a count that GREW — new prose is linted from its first
// commit, old debt is visible and burns down monotonically. When a count
// drops, run with --update-baseline and commit the tightened file, so the
// improvement can't regress either.
//
//   node scripts/lint-docs-sentences.mjs               # gate (CI)
//   node scripts/lint-docs-sentences.mjs --verbose     # every finding, file:line
//   node scripts/lint-docs-sentences.mjs --update-baseline
//
// Only `medium` and `high` severities gate; `candidate`/`low` print under
// --verbose but never fail the build — the low tiers are leads, not verdicts.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES } from "sentences/lint/registry";
import { runRules } from "sentences/lint/engine";
import { buildDocAnalysis } from "sentences/lint/build-doc";
import { extractProse } from "sentences/lint/markdown-prose";

const here = dirname(fileURLToPath(import.meta.url));
const ROOTS = [join(here, "..", "spec"), join(here, "..", "paper"), join(here, "..", "README.md")];
const BASELINE = join(here, "docs-sentences-baseline.json");
const GATED_SEVERITIES = new Set(["medium", "high"]);

const verbose = process.argv.includes("--verbose");
const updateBaseline = process.argv.includes("--update-baseline");

function docFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...docFiles(p));
    else if (/\.(md|mdx)$/.test(entry)) out.push(p);
  }
  return out.sort();
}

/** The frontmatter block replaced by spaces, so every offset after it is unchanged. */
function blankFrontmatter(text) {
  const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  return m ? m[0].replace(/[^\n]/g, " ") + text.slice(m[0].length) : text;
}

/** 1-based line of a prose-text offset — extractProse blanks non-prose but
 * preserves every offset, so spans map straight onto the source file. */
function lineOf(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

const files = ROOTS.flatMap((r) => (statSync(r).isDirectory() ? docFiles(r) : [r])).filter((f) => !f.includes("/fixtures/"));
const current = {}; // relPath -> ruleId -> count (gated severities only)
let total = 0;
let gated = 0;
const detail = [];

for (const file of files) {
  const rel = relative(join(here, ".."), file);
  const text = readFileSync(file, "utf8");
  // YAML frontmatter is metadata, not prose. `extractProse` blanks fences,
  // tables and inline code but leaves the `---` block, whose delimiters read
  // as em dashes and whose `key: value` lines read as colon nameplates; every
  // page was paying for its own frontmatter. Blank it, offsets preserved.
  const prose = extractProse(blankFrontmatter(text));
  const doc = buildDocAnalysis(prose);
  const { findings, errors } = runRules(RULES, doc);
  for (const e of errors) detail.push(`${rel}: rule ${e.ruleId} errored: ${e.message}`);
  for (const f of findings) {
    total++;
    if (verbose) detail.push(`${rel}:${lineOf(prose, f.span.start)} [${f.severity}] ${f.ruleId} — ${f.message}`);
    if (!GATED_SEVERITIES.has(f.severity)) continue;
    gated++;
    const perFile = (current[rel] ??= {});
    perFile[f.ruleId] = (perFile[f.ruleId] ?? 0) + 1;
  }
}

if (verbose) for (const line of detail) console.log(line);

if (updateBaseline) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 1) + "\n");
  console.log(`Docs prose lint: baseline written — ${gated} gated finding(s) across ${Object.keys(current).length} file(s) (${total} total incl. low tiers).`);
  process.exit(0);
}

let baseline = {};
try {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch {
  console.error(`Docs prose lint: no baseline at ${relative(process.cwd(), BASELINE)} — run with --update-baseline once and commit it.`);
  process.exit(1);
}

const regressions = [];
for (const [file, rules] of Object.entries(current)) {
  for (const [rule, count] of Object.entries(rules)) {
    const allowed = baseline[file]?.[rule] ?? 0;
    if (count > allowed) regressions.push(`${file}: ${rule} ${allowed} -> ${count}`);
  }
}

const baselineTotal = Object.values(baseline).reduce(
  (n, rules) => n + Object.values(rules).reduce((m, c) => m + c, 0),
  0,
);

if (regressions.length > 0) {
  console.error(`Docs prose lint: ${regressions.length} regression(s) against the baseline:`);
  for (const r of regressions) console.error(`  ${r}`);
  console.error("Fix the prose (rerun with --verbose for file:line), or — only for a deliberate style decision — --update-baseline and commit.");
  process.exit(1);
}

if (gated < baselineTotal) {
  console.log(`Docs prose lint: ${gated} gated finding(s), no regressions — ${baselineTotal - gated} BELOW the baseline of ${baselineTotal}; ratchet it down with --update-baseline.`);
} else {
  console.log(`Docs prose lint: ${gated} gated finding(s), no regressions. (${baselineTotal} baselined)`);
}
