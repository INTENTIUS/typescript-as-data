// Lint one or more files the way the ratchet does, printing file:line findings
// and, with --text, the prose each one covers. Used while editing: rewrite,
// re-run, confirm the finding is gone and nothing new arrived.
//
//   node scripts/check-prose.mjs spec/hosts.md
//   node scripts/check-prose.mjs --text spec/hosts.md
import { readFileSync } from "node:fs";
import { RULES } from "sentences/lint/registry";
import { runRules } from "sentences/lint/engine";
// The same dial lint-docs-sentences.mjs runs, so an ad-hoc check and the gate
// cannot disagree about whether a shape counts.
const STRICTNESS = Number(process.env.SENTENCES_STRICTNESS ?? 3);
import { buildDocAnalysis } from "sentences/lint/build-doc";
import { extractProse } from "sentences/lint/markdown-prose";
import { toProse } from "./lib/doc-prose.mjs";

const showText = process.argv.includes("--text");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const GATED = (f) => f.severity === "medium" || f.severity === "high" || f.ruleId === "reframe";
const lineOf = (t, o) => t.slice(0, o).split("\n").length;

let total = 0;
for (const file of files) {
  const prose = extractProse(toProse(readFileSync(file, "utf8")));
  const found = runRules(RULES, buildDocAnalysis(prose), STRICTNESS).findings.filter(GATED);
  total += found.length;
  console.log(`\n${file}: ${found.length} gated`);
  for (const x of found.sort((a, b) => a.span.start - b.span.start)) {
    console.log(`  ${file}:${lineOf(prose, x.span.start)} [${x.severity}] ${x.ruleId} — ${x.message.replace(/\s+/g, " ").slice(0, 95)}`);
    if (showText) console.log(`      ${JSON.stringify(prose.slice(x.span.start, x.span.end).replace(/\s+/g, " ").slice(0, 220))}`);
  }
}
if (files.length > 1) console.log(`\nTOTAL: ${total} gated`);
