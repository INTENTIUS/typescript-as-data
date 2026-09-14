// Markdown in, PROSE out, offsets preserved — the layer above `sentences`'
// own `extractProse`.
//
// `sentences` lints prose. Its extractor already blanks fences, tables and
// inline code so the rules never read markdown as writing. This module adds
// what a specification needs on top: a rule definition is formal notation,
// not a sentence, and neither is a heading, a list marker or a citation.
//
// Measured over spec/: 147 gated findings before, 109 after. The 38 that went
// were the notation being read as English — `**F-Eval-New.** For `new C(a₁ …
// aₙ)`: `C` must be a plain identifier, else reject.` came back as a fragment
// run and a colon reveal, and the baseline carried it as debt.
//
// Everything here BLANKS to spaces rather than deleting, the same contract
// `extractProse` keeps, so a finding's span still indexes the source file and
// a line number counted from the output is the real line number.

const blank = (s) => s.replace(/[^\n]/g, " ");
const blankRe = (text, re) => text.replace(re, (m) => blank(m));

/** YAML frontmatter: metadata, and its `---` reads as an em dash. */
export function blankFrontmatter(text) {
  const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  return m ? blank(m[0]) + text.slice(m[0].length) : text;
}

/** A Hugo shortcode is the number it renders, and its dots would end sentences. */
export const blankExpressions = (text) => text.replace(/\{\{[<%][^\n]*?[>%]\}\}/g, "0");

/**
 * Rule definitions and judgment notation.
 *
 * Keyed on the spec's own convention (README, Identifiers): a rule is a block
 * opening with its bolded identifier. The block runs to its blank line, and
 * the case analysis indented or listed under it belongs to it. Lines carrying
 * denotation or judgment symbols go the same way wherever they appear.
 */
export function blankNotation(text) {
  const lines = text.split("\n");
  const out = [...lines];
  const isDefOpen = (l) => /^\*\*[SF]-[A-Za-z0-9-]+/.test(l);
  const isListItem = (l) => /^\s*(?:[-*+]|\d+\.)\s/.test(l);
  const isIndented = (l) => /^\s{2,}\S/.test(l);
  const hasSymbols = (l) => /[⟦⟧⊢⇓Γρι∈≝≠⊆∪∅→←↦⊤⊥λ∀∃]|::=/.test(l);
  for (let i = 0; i < lines.length; i++) {
    if (!isDefOpen(lines[i])) {
      if (hasSymbols(lines[i])) out[i] = blank(lines[i]);
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].trim() !== "") out[j] = blank(lines[j]), j++;
    while (j < lines.length) {
      let k = j;
      while (k < lines.length && lines[k].trim() === "") k++;
      if (k >= lines.length || !(isListItem(lines[k]) || isIndented(lines[k]))) break;
      while (k < lines.length && lines[k].trim() !== "") out[k] = blank(lines[k]), k++;
      j = k;
    }
    i = j - 1;
  }
  return out.join("\n");
}

/**
 * A heading is a label and a list marker is punctuation; neither opens a
 * sentence. Both manufactured findings the baseline then had to carry — the
 * "consecutive sentences opening with ##" artifacts, and `7 sentences in a row
 * open with "-"`. The heading's text goes with it; the list item's text stays.
 */
export const blankMarkers = (text) => {
  let out = text;
  out = blankRe(out, /^ {0,3}#{1,6} .*$/gm);                    // heading line
  out = blankRe(out, /^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm);  // thematic break
  out = blankRe(out, /^(\s*)(?:[-*+]|\d+\.)(\s)/gm);           // list marker
  out = blankRe(out, /^(\s*)>+(\s)/gm);                         // blockquote marker
  return out;
};

/**
 * A bare filename is an identifier. Most are already inside backticks and go
 * with the inline code, but `grammar.md, judgments.md, values.md` written
 * plainly reaches the rules as three sentences whose dots end them — reported
 * as anaphora on "md," and a fragment pair. A filename after `/` or `(` is a
 * link target and belongs to `extractProse`, which needs it intact to match.
 */
export const blankFilenames = (text) => {
  let out = blankRe(text, /(?<![/(\w-])[A-Za-z0-9_-]+\.(?:md|mdx|ts|tsx|js|mjs|cjs|json|ya?ml|sh|rs|toml|lock)\b/g);
  // A version string is an identifier too, and its dots end sentences the same
  // way: `chant-v0.63.0 (…)` came back as the fragment "63.0 ( , #2328)".
  out = blankRe(out, /\b(?:[a-z][a-z0-9-]*-)?v\d+\.\d+(?:\.\d+)?\b/g);
  return out;
};

/**
 * A parenthesised citation is a pointer, not prose. Blanked whole, because
 * what survives otherwise is worse than the citation: `extractProse` empties
 * (`L8.1`) down to `1):`, which reads as a colon nameplate, and a range like
 * (L9.1–L9.4) splits on its dots into three short fragments.
 */
const CITE =
  /\(\s*(?:(?:see |and |also )?(?:[SF]-[A-Za-z0-9-]+|L\d+\.\d+|J\d|chant-v[\d.]+|(?:INTENTIUS\/)?chant#\d+|#\d+)[,;–—-]?\s*)+\)/g;
export const blankCitations = (text) => blankRe(text, CITE);

/** Everything above, in the order the layers depend on. */
export const toProse = (text) =>
  blankCitations(blankFilenames(blankMarkers(blankNotation(blankExpressions(blankFrontmatter(text))))));
