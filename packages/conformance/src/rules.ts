/**
 * #34 — the rule index, and the check a downstream document runs against it.
 *
 * chant's documentation describes the mechanism this specification owns. A
 * subset change that lands here can leave that prose describing the old
 * subset, and chant#2306 was three such claims, one in a shape chant's own
 * parity gate could not see because it only looked at fenced blocks under
 * headings. This gate looks at rule identifiers instead: every `S-*` or
 * `F-*` a document cites must exist at the specification version the
 * document's implementation declares, and where the document quotes a rule,
 * the quote must be the rule's own text.
 *
 * Two things a document can do, and what each is held to:
 *
 * - Mention an identifier in prose, `F-Depth`. It must be defined. Nothing
 *   about the surrounding claim is checked; the identifier is a link, and a
 *   link to nothing is the failure.
 * - Quote a rule, as a blockquote directly under a marker line. The marker
 *   is a comment on a line of its own whose content is `rule: F-Depth`, in
 *   MDX's comment form or HTML's, and the blockquote follows it:
 *
 *       > The rule's text, or its opening, verbatim.
 *
 *   The quoted text must occur verbatim in the rule's normative text. A
 *   paraphrase is a claim the gate cannot check, so it is not accepted where a
 *   quote was promised.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The five files that define rules, in reading order. The same list `spec/fixtures.test.ts` gates on. */
export const RULE_FILES = ["grammar.md", "judgments.md", "values.md", "divergence.md", "hosts.md"] as const;

export interface Rule {
  readonly id: string;
  readonly file: string;
  /** The rule's normative text: from its definition to the next definition or heading, whitespace collapsed. */
  readonly text: string;
}

const DEFINITION = [
  /^#{1,6}\s+([SF]-[A-Za-z0-9-]+)\b/,
  /^\*\*([SF]-[A-Za-z0-9-]+)[.\s(]/,
  /^\|\s*([SF]-[A-Za-z0-9-]+)\s*\|/,
  /^\s*([SF]-[A-Za-z0-9-]+)\s*::=/,
];

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** Every rule the specification defines, with its text. `specDir` holds the rule files and `VERSION`. */
export function loadRules(specDir: string): { version: string; rules: Map<string, Rule> } {
  const version = readFileSync(join(specDir, "VERSION"), "utf8").trim();
  const rules = new Map<string, Rule>();
  for (const file of RULE_FILES) {
    const lines = readFileSync(join(specDir, file), "utf8").split("\n");
    let current: { id: string; body: string[] } | undefined;
    const flush = () => {
      if (!current) return;
      const text = collapse(current.body.join("\n"));
      // A rule may be defined in more than one place (a table row and a
      // rationale paragraph). The first definition wins; later ones append.
      const prior = rules.get(current.id);
      rules.set(current.id, { id: current.id, file, text: prior ? `${prior.text} ${text}` : text });
      current = undefined;
    };
    for (const line of lines) {
      const id = DEFINITION.map((re) => re.exec(line)?.[1]).find(Boolean);
      if (id) { flush(); current = { id, body: [line] }; continue; }
      if (/^#{1,6}\s/.test(line) || /^---\s*$/.test(line)) { flush(); continue; }
      current?.body.push(line);
    }
    flush();
  }
  return { version, rules };
}

export type CitationFinding =
  | { kind: "unknown-identifier"; id: string; line: number }
  | { kind: "quote-not-in-rule"; id: string; line: number; quote: string }
  | { kind: "marker-without-quote"; id: string; line: number }
  | { kind: "version-mismatch"; declared: string; spec: string };

const IDENTIFIER = /\b([SF]-[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)\b/g;
const MARKER = /^\s*(?:\{\/\*|<!--)\s*rule:\s*([SF]-[A-Za-z0-9-]+)\s*(?:\*\/\}|-->)\s*$/;

/**
 * Check one document's citations against the rule index.
 *
 * @param declared the specification version the document's implementation
 *   declares, compared against the index's; `undefined` skips the comparison
 *   and is reported as nothing, since an undeclared version is #18's concern
 *   and not this gate's.
 */
export function checkCitations(
  document: string,
  index: { version: string; rules: ReadonlyMap<string, Rule> },
  declared?: string,
): CitationFinding[] {
  const findings: CitationFinding[] = [];
  if (declared !== undefined && declared !== index.version) {
    findings.push({ kind: "version-mismatch", declared, spec: index.version });
  }
  const lines = document.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = MARKER.exec(line);
    if (marker) {
      const id = marker[1];
      const rule = index.rules.get(id);
      if (!rule) { findings.push({ kind: "unknown-identifier", id, line: i + 1 }); continue; }
      const quoted: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s*>/.test(lines[j])) quoted.push(lines[j].replace(/^\s*>\s?/, "")), j++;
      if (quoted.length === 0) { findings.push({ kind: "marker-without-quote", id, line: i + 1 }); continue; }
      const quote = collapse(quoted.join(" "));
      if (!rule.text.includes(quote)) findings.push({ kind: "quote-not-in-rule", id, line: i + 1, quote });
      continue;
    }
    for (const m of line.matchAll(IDENTIFIER)) {
      if (!index.rules.has(m[1])) findings.push({ kind: "unknown-identifier", id: m[1], line: i + 1 });
    }
  }
  return findings;
}

/** One line per finding, for a test's failure message. */
export function describeFinding(f: CitationFinding): string {
  switch (f.kind) {
    case "unknown-identifier": return `line ${f.line}: ${f.id} is not a rule of this specification`;
    case "quote-not-in-rule": return `line ${f.line}: the quote under ${f.id} is not the rule's text: "${f.quote}"`;
    case "marker-without-quote": return `line ${f.line}: rule marker ${f.id} is not followed by a blockquote`;
    case "version-mismatch": return `the document's implementation declares spec ${f.declared}, the rules are at ${f.spec}`;
  }
}
