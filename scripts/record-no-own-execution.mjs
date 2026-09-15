#!/usr/bin/env node
// Regenerate the F-NoOwnExecution recording (#178).
//
// Writes packages/conformance/no-own-execution.json from the committed
// fixtures, which docs/scripts/sync-spec.mjs reads into figures.json. JSON and
// not a markdown report on purpose: the corpus report is slurped back with
// regexes and #190 is the bug that habit produced, so this artifact is read
// with JSON.parse and has no table to drift from.
//
// The same numbers are asserted by packages/conformance/src/no-own-execution.test.ts,
// so a stale artifact is a diff and a wrong one is a failing gate.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "packages", "reference", "no-own-execution.json");

const script = `
import { record, byRule } from ${JSON.stringify(pathToFileURL(join(root, "packages", "reference", "src", "recording.ts")).href)};
const r = record(${JSON.stringify(join(root, "spec"))});
const panels = r.panels.map((p) => ({
  id: p.id, title: p.title, claim: p.claim,
  fixtures: p.fixtures.length, invocations: p.events.length, witnessed: p.witnessed,
  byRule: byRule(p.events), counters: p.counters, failures: p.failures,
}));
process.stdout.write(JSON.stringify({ specVersion: r.specVersion, panels, arms: r.arms }, null, 2) + "\\n");
`;

const json = execFileSync("npx", ["tsx", "-e", script], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const parsed = JSON.parse(json);
const failed = parsed.panels.flatMap((p) => p.failures);
if (failed.length > 0) {
  console.error("the recording does not hold:");
  for (const f of failed) console.error("  " + f);
  process.exit(1);
}
writeFileSync(out, JSON.stringify(parsed, null, 2) + "\n");
console.log(`no-own-execution.json: ${parsed.panels.map((p) => `${p.id}=${p.invocations}/${p.fixtures}`).join(" ")} arms=${JSON.stringify(parsed.arms.reached)}`);
