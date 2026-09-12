/** #34 — the rule index, the citation check, and chant's docs against both when a checkout is at hand. */
import { describe, test, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadRules, checkCitations, describeFinding, bundledSpecDir } from "./index";
import { chantAdapter } from "./adapters/chant";

const index = loadRules(bundledSpecDir());

describe("the rule index (#34)", () => {
  test("indexes every rule the fixture gate knows, with text", () => {
    expect(index.version).toMatch(/^\d+\.\d+$/);
    expect(index.rules.size).toBeGreaterThanOrEqual(120);
    for (const id of ["S-Ident", "F-Eval-Ident", "F-Prebuild", "F-Depth", "F-Val-Fate", "F-Div-Nullish", "F-Host-Trust"]) {
      expect(index.rules.has(id), id).toBe(true);
      expect(index.rules.get(id)!.text.length, `${id} has text`).toBeGreaterThan(20);
    }
  });
});

describe("the citation check (#34)", () => {
  test("an identifier that is not a rule is reported with its line", () => {
    const f = checkCitations("chant implements F-Eval-Ident.\nAnd also F-Made-Up here.\n", index);
    expect(f.map(describeFinding)).toEqual(["line 2: F-Made-Up is not a rule of this specification"]);
  });
  test("a verbatim quote passes and a paraphrase does not", () => {
    const depth = index.rules.get("F-Depth")!.text;
    const words = depth.split(" ").slice(0, 8).join(" ");
    expect(checkCitations(`{/* rule: F-Depth */}\n> ${words}\n`, index)).toEqual([]);
    const f = checkCitations(`<!-- rule: F-Depth -->\n> The bounds are whatever an implementation likes.\n`, index);
    expect(f.map((x) => x.kind)).toEqual(["quote-not-in-rule"]);
  });
  test("a marker with no quote, and a declared version that is not the index's", () => {
    const f = checkCitations(`{/* rule: F-Depth */}\nprose instead of a quote\n`, index, "2.0");
    expect(f.map((x) => x.kind).sort()).toEqual(["marker-without-quote", "version-mismatch"]);
  });
});

const chant = process.env.TSAD_CHANT_REPO ? resolve(process.env.TSAD_CHANT_REPO) : undefined;
const DOCS = ["docs/src/content/docs/concepts/typescript-as-data.mdx", "docs/src/content/docs/architecture/sandbox.mdx"];

describe.skipIf(!chant || !DOCS.every((d) => existsSync(join(chant, d))))("chant's docs cite only rules that exist (#34)", () => {
  for (const doc of DOCS) {
    test(doc, () => {
      const declared = chantAdapter.specVersion === "undeclared" ? undefined : chantAdapter.specVersion;
      const findings = checkCitations(readFileSync(join(chant!, doc), "utf8"), index, declared);
      expect(findings.map(describeFinding), findings.map(describeFinding).join("\n")).toEqual([]);
    });
  }
});
