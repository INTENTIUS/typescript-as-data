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
// bold-first bullets, …) that tropes.fyi catalogs and the package detects
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
// `medium` and `high` severities gate, and so does any rule in ALWAYS_GATED
// whatever its severity; `candidate`/`low` otherwise print under --verbose but
// never fail the build — the low tiers are leads, not verdicts.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES } from "sentences/lint/registry";
import { runRules } from "sentences/lint/engine";
import { buildDocAnalysis } from "sentences/lint/build-doc";
import { extractProse } from "sentences/lint/markdown-prose";
import { toProse } from "./lib/doc-prose.mjs";

// The dial, 1 lenient / 2 calibrated / 3 strict. This repository runs 3.
//
// The package calibrates its floors against deliberate human prose, so that a
// density rule does not flag Melville for em dashes. That is the right default
// for editing a person and the wrong one here, where the prose is drafted by a
// model and the question is whether the shape is present at all rather than
// whether there is too much of it. At 3 every density floor is zero and a
// first instance is reported, which is what catches a tic before it becomes a
// habit. SENTENCES_STRICTNESS overrides it for a one-off comparison.
// Passed as a number: the package does not export ./lint/strictness, so the
// level is validated here rather than imported.
const STRICTNESS = (() => {
  const n = Number(process.env.SENTENCES_STRICTNESS ?? 3);
  if (![1, 2, 3].includes(n)) throw new Error(`SENTENCES_STRICTNESS must be 1, 2 or 3, not ${process.env.SENTENCES_STRICTNESS}`);
  return n;
})();

const here = dirname(fileURLToPath(import.meta.url));
// The docs site's authored pages are prose too (#85); content/spec/normative
// under it is generated from spec/*.md and is linted at its source.
const ROOTS = [join(here, "..", "spec"), join(here, "..", "paper"), join(here, "..", "README.md"), join(here, "..", "docs", "content")];
const GENERATED = join("docs", "content", "spec", "normative");
const BASELINE = join(here, "docs-sentences-baseline.json");

/**
 * Rules a list item is exempt from, and only these.
 *
 * `doc-prose.mjs` blanks a list marker to spaces so the offsets survive, which
 * merges consecutive items into one paragraph. A list of noun phrases then
 * reads as a run of sentence fragments, and a definition item reads as a bare
 * noun phrase answered by a negation. `README.md`'s index of rule files and
 * `verdict.md`'s three isolation modes are both of those, and both are
 * ordinary documentation rather than the tic the rule is named for.
 *
 * Narrow on purpose. Only the shape rules whose evidence is *adjacency* are
 * listed: two of them read one item as the next one's neighbour, and
 * `tricolon/density` counts a series that the blanked markers fabricated
 * across items — five bullets are a list, which is the right format for five
 * things, rather than a comma series padded past a tricolon. Every other rule
 * still fires inside a list, because a reframe or a colon-reveal is the same
 * tic wherever it is written.
 *
 * Making the extractor end each item with a stop instead was tried and is
 * worse: a leading full stop reads as its own sentence and produced seven new
 * findings across paper/ and docs/ that the spaces never caused.
 */
const LIST_EXEMPT = new Set(["discourse/punchy-fragments", "discourse/setup-turn", "tricolon/density"]);
/**
 * A sentence that was code is not a fragment.
 *
 * Inline code and judgment notation are blanked to spaces so the offsets
 * survive, so `The isolation mode \`ι\` is one of \`open\`, \`isolated\` and
 * \`executing\`.` reaches the rules as "The isolation" and a gap. Two of those
 * in a row are reported as punchy fragments, and the prose they were cut from
 * is an ordinary sentence. A span more than half blank is the signature, and
 * only the two rules that count sentence shape consult it — a span's density
 * says nothing about whether a reframe is a reframe.
 */
const FRAGMENT_RULES = new Set(["discourse/punchy-fragments", "discourse/setup-turn"]);
const mostlyBlanked = (prose, span) => {
  const text = prose.slice(span.start, span.end);
  if (text.length === 0) return false;
  return (text.match(/\s/g) ?? []).length / text.length > 0.5;
};

const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s/;
/** Whether line `n` of `text` (1-based) is a list item, its continuation included. */
function inList(text, n) {
  const lines = text.split("\n");
  for (let i = n - 1; i >= 0; i--) {
    const l = lines[i];
    if (l === undefined) continue;
    if (LIST_ITEM.test(l)) return true;
    if (l.trim() === "") return false;
    if (!/^\s/.test(l)) return false;
  }
  return false;
}

/**
 * Whether a finding's span reaches a list. The start line alone is not enough:
 * a series drawn from bullets is reported at the sentence above them, so
 * `grammar.md uses BNF.` carried the count of the five-symbol legend beneath
 * it.
 */
function touchesList(text, from, to) {
  for (let n = from; n <= to; n++) if (inList(text, n)) return true;
  return false;
}
const GATED_SEVERITIES = new Set(["medium", "high"]);
// Rules that gate whatever severity they carry. `reframe` detects the
// negate-then-restate shape ("It is not X. It is Y."), the first pattern on
// the tropes list, and it fires at `low`, so the severity set alone never
// sees it. Measured at five real findings in seven over 32 files of prose
// outside this repo; a wrong finding costs one baseline line, which is what
// a ratchet is for. Adding "low" to the set above is the wrong lever: it
// would gate every low finding, and low is where the bulk lives.
const ALWAYS_GATED = new Set(["reframe"]);

const verbose = process.argv.includes("--verbose");
const updateBaseline = process.argv.includes("--update-baseline");

function docFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (p.includes(GENERATED)) continue;
    if (statSync(p).isDirectory()) out.push(...docFiles(p));
    else if (/\.(md|mdx)$/.test(entry)) out.push(p);
  }
  return out.sort();
}

/** 1-based line of a prose-text offset — extractProse blanks non-prose but
 * preserves every offset, so spans map straight onto the source file. */
function lineOf(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

const files = ROOTS.flatMap((r) => (statSync(r).isDirectory() ? docFiles(r) : [r])).filter((f) => !f.includes("/fixtures/") && !f.includes("/content/docs/spec/"));
const current = {}; // relPath -> ruleId -> count (gated severities only)
let total = 0;
let gated = 0;
const detail = [];

for (const file of files) {
  const rel = relative(join(here, ".."), file);
  const text = readFileSync(file, "utf8");
  // scripts/lib/doc-prose.mjs blanks what is not prose before `extractProse`
  // runs: frontmatter, shortcodes, rule definitions and judgment notation,
  // heading and list markers, parenthesised citations. Offsets are preserved
  // throughout, so a span still indexes this file.
  const prose = extractProse(toProse(text));
  const doc = buildDocAnalysis(prose);
  const { findings, errors } = runRules(RULES, doc, STRICTNESS);
  for (const e of errors) detail.push(`${rel}: rule ${e.ruleId} errored: ${e.message}`);
  for (const f of findings) {
    total++;
    const line = lineOf(prose, f.span.start);
    if (verbose) detail.push(`${rel}:${line} [${f.severity}] ${f.ruleId} — ${f.message}`);
    if (!GATED_SEVERITIES.has(f.severity) && !ALWAYS_GATED.has(f.ruleId)) continue;
    if (LIST_EXEMPT.has(f.ruleId) && touchesList(text, line, lineOf(prose, f.span.end))) continue;
    if (FRAGMENT_RULES.has(f.ruleId) && mostlyBlanked(prose, f.span)) continue;
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
