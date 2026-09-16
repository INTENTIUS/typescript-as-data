/**
 * The paper's citations, held to the repository they cite (#214).
 *
 * `paper/*.md` was the last document set outside the net. `figures.test.ts`
 * put its integers under a gate (#174) after `measurements.md` carried "76 of
 * the 122" against a tree holding 127. Its version citations and its
 * rule-to-file citations stayed prose, and both drifted: Appendix B claimed
 * spec 1.8 and packages 1.8.0 against a repository at 2.1, and `mechanism.md`
 * sent a reader to `judgments.md` for `F-Profile`, which #168 left a 14-line
 * index when it split that file five ways.
 *
 * WHAT IS DELIBERATELY NOT CHECKED. Most version strings in the paper are
 * history and are right as written. `measurements.md` records corpus runs
 * taken at spec 1.6, 1.7 and 1.8, and those rows are the evidence that
 * agreement held while the rule set moved. Forcing every version to the
 * current one would delete the record the table exists for. So this gates the
 * two things that are claims about NOW, and leaves the history alone.
 */
import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = join(ROOT, "spec");
const PAPER = join(ROOT, "paper");

const read = (p: string) => readFileSync(p, "utf8");
const paperFiles = readdirSync(PAPER).filter((f) => f.endsWith(".md"));
const specFiles = new Set(readdirSync(SPEC).filter((f) => f.endsWith(".md")));

const VERSION = read(join(SPEC, "VERSION")).trim();
const packageVersion = JSON.parse(read(join(ROOT, "packages", "conformance", "package.json"))).version as string;
const chantPin = JSON.parse(read(join(ROOT, "package.json"))).devDependencies["@intentius/chant"] as string;

describe("the paper's statement of what it ships (#214)", () => {
  const draft = read(join(PAPER, "draft.md"));

  /** One claim about the present, found by the words around it rather than by line number. */
  const claim = (re: RegExp, what: string) => {
    const m = re.exec(draft);
    expect(m, `Appendix B no longer says ${what}; the gate cannot check what it cannot find`).not.toBeNull();
    return m![1];
  };

  test("the specification version and its tag are the current ones", () => {
    expect(claim(/specification is at version `([^`]+)`/, "which version the specification is at")).toBe(VERSION);
    expect(claim(/tagged `spec-([^`]+)`/, "which tag the specification carries")).toBe(VERSION);
  });

  test("the published package version is the current one", () => {
    expect(claim(/published to npm at `([^`]+)`/, "what the packages are published at")).toBe(packageVersion);
  });

  test("the chant pin is the current one", () => {
    // The pin the numbers were taken with. It moves when the corpus is
    // regenerated, so a stale one here means the paper's section 6 is
    // attributed to an engine that did not produce it.
    expect(claim(/chant pinned at `([^`]+)`/, "which chant the numbers were taken with")).toBe(chantPin);
  });
});

/** `**F-Name.**`, `## F-Name`, a table row, or a grammar production: how a rule file defines an identifier. */
const definesRule = (text: string, id: string): boolean =>
  new RegExp(`^(?:#{1,6}\\s+${id}\\b|\\*\\*${id}[.\\s(]|\\|\\s*${id}\\s*\\||\\s*${id}\\s*::=)`, "m").test(text);

const IDENTIFIER = /\b([SF]-[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)\b/g;
const SPEC_FILE = /`(?:spec\/)?([a-z-]+\.md)`/g;

describe("the paper's rule citations name a file that defines the rule", () => {
  for (const file of paperFiles) {
    test(`${file}`, () => {
      const text = read(join(PAPER, file));
      const offences: string[] = [];
      // Sentence-sized windows. A citation and the identifiers it is for sit
      // in one sentence; a paragraph would let an unrelated rule three
      // sentences away satisfy the check.
      const sentences = text.split(/(?<=[.!?])\s+|\n\n+/);
      for (const sentence of sentences) {
        const cited = [...sentence.matchAll(SPEC_FILE)].map((m) => m[1]).filter((f) => specFiles.has(f));
        if (cited.length === 0) continue;
        const ids = [...new Set([...sentence.matchAll(IDENTIFIER)].map((m) => m[1]))];
        if (ids.length === 0) continue;
        // Lenient on purpose: one sentence may cite one file and name several
        // rules, only some of which live there. What it must not do is name a
        // file that defines none of them.
        const satisfied = cited.some((f) => ids.some((id) => definesRule(read(join(SPEC, f)), id)));
        if (!satisfied) {
          offences.push(`${cited.join(", ")} defines none of ${ids.join(", ")} — "${sentence.trim().slice(0, 100)}…"`);
        }
      }
      expect(offences).toEqual([]);
    });
  }
});
