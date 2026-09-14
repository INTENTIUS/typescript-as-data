/**
 * The voice gate: no sentence in the spec's prose may be two parts split by a
 * comma, the "some prose, some trailing prose" shape. Either the comma goes
 * and the sentence reads as one, or the trailing half goes.
 *
 * This is a house-style rule, not one of the `sentences` package's, which is
 * why it lives here rather than in the trope ruleset. The package's own
 * detectors for the rhetorical version of the shape (mirrored clauses,
 * aphoristic enders, dilution) report nothing on this corpus; the shape is a
 * voice question, and the answer is local.
 *
 * Two exclusions, both structural rather than stylistic:
 *
 *   - A LEADING adverbial ("Where the profile refuses, the run is not
 *     consulted"). There the second half is the main clause, not a trailing
 *     one, so the sentence is not two parts with a tail.
 *   - A comma inside PARENTHESES, which belongs to a citation or a
 *     bibliographic reference: `(L5.9, leakedIdentity)`, `(TCS 248, 2000)`.
 *     Those are notation that happens to contain a comma.
 *
 * Prose is whatever survives scripts/lib/doc-prose.mjs and the package's
 * `extractProse`, so rule definitions, tables, fences, headings, list markers
 * and inline code are already out of scope.
 *
 * A WARNING for whoever satisfies this rule. DELETION IS THE ONLY EDIT THAT
 * CANNOT CREATE A NEW ADJACENCY. Every fix that made the prose worse, across
 * seven edits and three rules, rearranged what sat next to what:
 *
 *   - commas replaced by "and ... and ... and", satisfying tricolon/comma-series
 *     and reading worse than the commas
 *   - a sentence split to fix a comma, colliding with an anaphora three
 *     sentences later
 *   - a trailing clause moved so its "which" attached to the wrong noun
 *   - a parenthetical unwrapped, moving an item INTO a comma series without
 *     moving a word: the parens were holding it out
 *   - a sentence split to reduce a tricolon, which moved the boundary without
 *     removing an item, so the density rule fired again
 *
 * The last two are the instructive ones. Unwrapping and splitting feel like
 * reductions and are not; a rule counting items sees the same items in a new
 * arrangement. One of the seven was introduced while fixing a FACTUAL error,
 * so the failure mode does not care what kind of edit you are making, only
 * that you moved something.
 *
 * None was caught on the first pass by the person making the edit. That is
 * what these gates are for: not the tics you wrote, the tics your fix
 * introduced. Prefer the cut, and re-run after each edit rather than at the end.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error -- plain ESM helper, no types
import { toProse } from "../scripts/lib/doc-prose.mjs";
import { extractProse } from "sentences/lint/markdown-prose";

const specDir = dirname(fileURLToPath(import.meta.url));

const LEADING_ADVERBIAL =
  /^(where|when|if|unless|under|for|in|on|at|by|with|without|after|before|until|while|because|since|although|though|given|once|as|to|from|per|across|beyond|inside|outside|whenever|wherever|rather|instead|only|there|here|that|of|about|against|among|between|like|near|past|through|via|upon)\b/i;

/** Parenthesised spans blanked, so a citation's comma cannot look like a split. */
function blankParens(text: string): string {
  return text.replace(/\([^()\n]*\)/g, (m) => " ".repeat(m.length));
}

interface Offence { file: string; line: number; head: string; tail: string }

function offences(): Offence[] {
  const out: Offence[] = [];
  for (const file of readdirSync(specDir).filter((f) => f.endsWith(".md"))) {
    const prose = blankParens(extractProse(toProse(readFileSync(join(specDir, file), "utf8"))));
    let start = 0;
    for (const m of prose.matchAll(/[.!?][)*"'\]`]*(?=\s|$)/g)) {
      const end = m.index! + m[0].length;
      const sentence = prose.slice(start, end).replace(/\s+/g, " ").trim();
      const at = prose.slice(0, start).split("\n").length;
      start = end;
      if ((sentence.match(/,/g) ?? []).length !== 1) continue;
      const i = sentence.indexOf(",");
      const head = sentence.slice(0, i).trim();
      const tail = sentence.slice(i + 1).trim();
      if (!head || !tail) continue;
      if (LEADING_ADVERBIAL.test(head.replace(/^[*_`\s]+/, ""))) continue;
      out.push({ file, line: at, head, tail });
    }
  }
  return out;
}

describe("voice: no two-part comma sentences in spec prose", () => {
  test("every sentence is one part, or its trailing half is gone", () => {
    const found = offences().map((o) => `${o.file}:${o.line}  ${o.head}  ||  ${o.tail}`);
    expect(found).toEqual([]);
  });
});
