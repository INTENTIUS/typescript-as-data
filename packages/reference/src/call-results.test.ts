/** Spec 2.2: a same-file call's result read inside an F-Call argument, and a call-bound local exported by name. */
import { describe, test, expect } from "vitest";
import { foldProject } from "./project";
import { requireHost } from "@intentius/tsad-conformance";

const hostOf = (name: string) => {
  const h = requireHost(name);
  return { intrinsics: h.intrinsics, helpers: h.helpers, ownedSpecifierPrefixes: h.ownedSpecifierPrefixes, values: h.values };
};
const fold = (source: string) => {
  const r = foldProject(new Map([["a.ts", source]]), hostOf("shapes"));
  return { verdict: r.verdicts.get("a.ts")!, counters: r.counters };
};

describe("reads in an argument (F-Call, spec 2.2)", () => {
  test("every read of the name is the one instance, shared with its own declarator", () => {
    const { verdict, counters } = fold(`import { makePair } from "@tsad/shapes";
export const first = makePair("a", "b");
export const listed = makePair([first, { again: first }], "l");`);
    expect(verdict.kind).toBe("fold");
    if (verdict.kind !== "fold") return;
    const listed = verdict.exports.get("listed") as { left: [unknown, { again: unknown }] };
    expect(listed.left[0]).toBe(verdict.exports.get("first"));
    expect(listed.left[1].again).toBe(listed.left[0]);
    expect(counters?.factoryInvocations).toBe(2);
  });
  test("a read inside a new written in the argument qualifies", () => {
    const { verdict } = fold(`import { makePair, Bucket } from "@tsad/shapes";
const p = makePair(1, 2);
export const q = makePair(new Bucket({ name: "b", tags: [p] }), 0);`);
    expect(verdict.kind).toBe("fold");
  });
  test("the binding lasts only for the argument: a later read in an object literal still rejects", () => {
    const { verdict } = fold(`import { makePair } from "@tsad/shapes";
const p = makePair(1, 2);
export const q = makePair({ inner: p }, 0);
export const plain = { inner: p };`);
    expect(verdict.kind).toBe("run");
    if (verdict.kind === "run") expect(verdict.reason).toContain("function call as a value is not foldable");
  });
  test("an alias does not qualify: the name must be bound to the call itself", () => {
    const { verdict } = fold(`import { makePair } from "@tsad/shapes";
const p = makePair(1, 2);
const alias = p;
export const q = makePair({ inner: alias }, 0);`);
    expect(verdict.kind).toBe("run");
  });
});

describe("a call-bound local exported by name (F-Declarator named-export, spec 2.2)", () => {
  test("the local and an alias of it are one call, resolved once", () => {
    const { verdict, counters } = fold(`import { makePair } from "@tsad/shapes";
const pair = makePair("l", "r");
const alias = pair;
export { pair, alias as again };`);
    expect(verdict.kind).toBe("fold");
    if (verdict.kind !== "fold") return;
    expect(verdict.exports.get("again")).toBe(verdict.exports.get("pair"));
    expect(counters?.factoryInvocations).toBe(1);
  });
  test("a member access on a call exported by name indexes the result", () => {
    const { verdict } = fold(`import { makePair } from "@tsad/shapes";
const left = makePair("l", "r").left;
export { left };`);
    expect(verdict.kind).toBe("fold");
    if (verdict.kind === "fold") expect(verdict.exports.get("left")).toBe("l");
  });
});
