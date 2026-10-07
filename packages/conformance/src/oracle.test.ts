/**
 * The checker oracle (#233). The first block is the method on cases written
 * for it; the second is the oracle over `spec/fixtures/`, folded by the
 * reference in `data-host`.
 */
import { describe, test, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { referenceDataHostAdapter } from "@intentius/tsad-reference";
import { loadFixtures } from "./fixture";
import {
  runOracle, summarizeOracle, fixtureSubjects, wrapSource, renderPath, notPlainData, resultKey, EXPECTED_FAILURES,
  type OracleSubject, type OracleResult,
} from "./oracle";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "spec", "fixtures");
const one = (unit: string, source: string, exports: Record<string, unknown>, file = "f.ts", extra: Record<string, string> = {}): OracleSubject =>
  ({ unit, files: new Map([[file, source], ...Object.entries(extra)]), file, exports });

describe("the method", () => {
  let byUnit: Map<string, OracleResult[]>;
  const at = (unit: string, exportName?: string) => {
    const r = byUnit.get(unit)!.find((x) => exportName === undefined || x.exportName === exportName);
    if (!r) throw new Error(`no result for ${unit}#${exportName}`);
    return r;
  };
  const OBJ = `export const a = { target: "es5", n: 3, xs: [1, "two"], nested: { ok: true, none: null, u: undefined } };\n`;
  const value = { target: "es5", n: 3, xs: [1, "two"], nested: { ok: true, none: null, u: undefined } };

  beforeAll(() => {
    const results = runOracle([
      one("exact", OBJ, { a: value }),
      one("drops-a-key", OBJ, { a: (({ n: _n, ...rest }) => rest)(value) }),
      one("adds-a-key", OBJ, { a: { ...value, extra: 1 } }),
      one("changes-a-value", OBJ, { a: { ...value, target: "esnext" } }),
      one("changes-an-element", OBJ, { a: { ...value, xs: [1, "three"] } }),
      one("lying-assertion", `export const t = "es5" as unknown as "esnext";\n`, { t: "es5" }),
      one("widened", `export const w = "a" as string;\nexport const r: Record<string, number> = { a: 1 };\nexport const s: { a: string; b: 1 } = { a: "x", b: 1 };\n`, { w: "a", r: { a: 1 }, s: { a: "x", b: 1 } }),
      one("widened-but-wrong", `export const r: Record<string, number> = { a: 1 };\n`, { r: { a: "one" } }),
      one("default-across-files", `import base from "./base";\nexport const doubled = { ...base, replicas: 4 };\n`, { doubled: { name: "svc", replicas: 4 } }, "app.ts", { "base.ts": `export default { name: "svc", replicas: 2 };\n` }),
      one("error-type", `const o = { a: 1 };\nexport const x = (o as any).nope?.b;\nexport const y = true ? "yes" : getId();\n`, { x: undefined, y: "yes!" }),
      one("no-such-export", `export const a = 1;\n`, { b: 1 }),
      one("out-of-scope", `export const m = new Map();\nexport const e = { x: 1 };\nexport const f = 1;\n`, { m: {}, e: { __intrinsic: "join", strings: [], values: [] }, f: () => 1 }),
      one("climbs-out", `import { port } from "../../shared/config";\nexport const p = { port };\n`, { p: { port: 8080 } }, "app/main.ts", { "../shared/config.ts": `export const port = 8080;\n` }),
    ]);
    byUnit = new Map();
    for (const r of results) byUnit.set(r.unit, [...(byUnit.get(r.unit) ?? []), r]);
  }, 60_000);

  test("an exact fold passes, every leaf checked", () => {
    const r = at("exact");
    expect(r.verdict, r.diagnostics.join("\n")).toBe("pass");
    expect([r.leaves, r.checkedLeaves]).toEqual([7, 7]);
  });

  test("a fold that drops, adds or changes anything fails", () => {
    for (const u of ["drops-a-key", "adds-a-key", "changes-a-value", "changes-an-element"]) expect(at(u).verdict, u).toBe("fail");
  });

  test("a lying assertion fails both ways, which is why such a fixture is listed as expected", () => {
    const r = at("lying-assertion");
    expect(r.verdict).toBe("fail");
    expect(r.diagnostics.join("\n")).toMatch(/"es5".*"esnext"/);
    expect(r.diagnostics.join("\n")).toMatch(/"esnext".*"es5"/);
    // Listed, it counts as expected; a listed key that does not fail is reported stale.
    const listed = { [resultKey(r)]: "the assertion lies", "gone:f.ts#x": "a fixture since removed" };
    const s = summarizeOracle([r], listed);
    expect([s.failExpected, s.failUnexpected.length, s.expectedButPassed]).toEqual([1, 0, ["gone:f.ts#x"]]);
  });

  test("where the checker has no literal the verdict is unchecked, with the path, never pass", () => {
    expect(at("widened", "w")).toMatchObject({ verdict: "unchecked", uncheckedPaths: ["$"], checkedLeaves: 0 });
    expect(at("widened", "r")).toMatchObject({ verdict: "unchecked", uncheckedPaths: ["$"] });
    expect(at("widened", "s")).toMatchObject({ verdict: "unchecked", uncheckedPaths: ["$.a"], leaves: 2, checkedLeaves: 1 });
  });

  test("a type the checker could not compute is unchecked, not a pass", () => {
    // An unresolved name or a missing property gives an error type, which
    // absorbs every conditional over it; the probe is inverted so that this
    // reads as not exact.
    expect(at("error-type", "x")).toMatchObject({ verdict: "unchecked", uncheckedPaths: ["$"] });
    expect(at("error-type", "y")).toMatchObject({ verdict: "unchecked", uncheckedPaths: ["$"] });
  });

  test("an unchecked node still has to admit the fold", () => {
    expect(at("widened-but-wrong").verdict).toBe("fail");
  });

  test("a build of several files, default export included", () => {
    expect(at("default-across-files").verdict, at("default-across-files").diagnostics.join("\n")).toBe("pass");
    expect(at("climbs-out").verdict, at("climbs-out").diagnostics.join("\n")).toBe("pass");
  });

  test("a fold of an export the checker does not see fails", () => {
    expect(at("no-such-export").verdict).toBe("fail");
  });

  test("new, envelopes and live values are out of scope, not failures", () => {
    expect(at("out-of-scope", "m")).toMatchObject({ verdict: "out-of-scope", reason: "constructs with new" });
    expect(at("out-of-scope", "e").reason).toMatch(/envelope \(__intrinsic\)/);
    expect(at("out-of-scope", "f").reason).toMatch(/function/);
  });

  test("the copy wraps plain-data initializers and leaves calls and functions alone", () => {
    const out = wrapSource(`const a = { x: 1 };\nexport const b = f(a);\nexport const c = () => 1;\nexport default [a.x];\n`);
    expect(out).toContain("const a = __tsad_exact({ x: 1 });");
    expect(out).toContain("export const b = f(a);");
    expect(out).toContain("export const c = () => 1;");
    expect(out).toContain("export default __tsad_exact([a.x]);");
    expect(out).toContain("declare function __tsad_exact<const T>(v: T): T;");
  });

  test("paths and scope helpers", () => {
    expect(renderPath(["a", "0", "with-dash"], [false, true, false])).toBe(`$.a[0]["with-dash"]`);
    expect(notPlainData({ a: [1, null, undefined, Infinity] })).toBeUndefined();
    expect(notPlainData({ a: new Date(0) })).toMatch(/Date at \$\.a/);
  });
});

describe("over spec/fixtures, folded by the reference in data-host", () => {
  let results: OracleResult[];
  let subjects: OracleSubject[];
  beforeAll(async () => {
    subjects = await fixtureSubjects(referenceDataHostAdapter, loadFixtures(fixturesDir));
    results = runOracle(subjects);
  }, 60_000);

  test("no failure the expected list does not name, and every listed one still fails", () => {
    const s = summarizeOracle(results);
    const lines = s.failUnexpected.map((r) => `${resultKey(r)}: ${r.diagnostics.join(" | ")}`);
    expect(lines, lines.join("\n")).toEqual([]);
    expect(s.expectedButPassed).toEqual([]);
    expect(s.failExpected).toBe(Object.keys(EXPECTED_FAILURES).length);
  });

  test("the oracle is not vacuous: most of what is in scope is checked", () => {
    const s = summarizeOracle(results);
    expect(s.exports - s.outOfScope).toBeGreaterThan(50);
    expect(s.pass).toBeGreaterThan(30);
    expect(s.checkedLeaves / s.leaves).toBeGreaterThan(0.5);
  });

  test("every export that passes fails once its fold is changed, dropped from or added to", () => {
    // The mutation control: a pass that survives a wrong value means the check
    // compared nothing. It found the error-type hole the inverted probe closes.
    const passing = new Set(results.filter((r) => r.verdict === "pass").map(resultKey));
    const mutate = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.length ? [mutate(v[0]), ...v.slice(1)] : [0];
      if (v !== null && typeof v === "object") {
        const entries = Object.entries(v);
        return entries.length ? { ...v, [entries[0][0]]: mutate(entries[0][1]) } : { added: 0 };
      }
      if (typeof v === "string") return v + "!";
      if (typeof v === "number") return v + 1;
      if (typeof v === "boolean") return !v;
      return v === null ? 0 : null;
    };
    const dropped = (v: unknown): unknown =>
      Array.isArray(v) ? v.slice(1) : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).slice(1)) : undefined;
    const added = (v: unknown): unknown =>
      Array.isArray(v) ? [...v, 0] : v !== null && typeof v === "object" ? { ...v, "added-by-the-mutation": 0 } : undefined;
    const variants: [string, OracleSubject][] = [];
    for (const s of subjects) {
      for (const [name, v] of Object.entries(s.exports)) {
        if (!passing.has(resultKey({ unit: s.unit, file: s.file, exportName: name }))) continue;
        const unit = (how: string) => `${s.unit}~${how}`;
        variants.push(["changed", { ...s, unit: unit("changed"), exports: { [name]: mutate(v) } }]);
        if (v !== null && typeof v === "object" && Object.keys(v).length) {
          variants.push(["dropped", { ...s, unit: unit("dropped"), exports: { [name]: dropped(v) } }]);
          variants.push(["added", { ...s, unit: unit("added"), exports: { [name]: added(v) } }]);
        }
      }
    }
    expect(variants.filter(([how]) => how === "changed").length).toBe(passing.size);
    expect(variants.some(([how]) => how === "added")).toBe(true);
    const survived = runOracle(variants.map(([, s]) => s)).filter((r) => r.verdict !== "fail").map(resultKey);
    expect(survived).toEqual([]);
  }, 60_000);
});
