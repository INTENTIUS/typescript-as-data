/** #68 — F-Prebuild and F-Count: one instance per same-file construction, shared by every reference. */
import { describe, test, expect } from "vitest";
import { foldProject } from "./project";
import { requireHost } from "@intentius/tsad-conformance";
import { referenceAdapter } from "./adapter";

const hostOf = (name: string) => {
  const h = requireHost(name);
  return { intrinsics: h.intrinsics, helpers: h.helpers, ownedSpecifierPrefixes: h.ownedSpecifierPrefixes, values: h.values };
};

describe("F-Prebuild (#68)", () => {
  test("every reference to a same-file construction is the one instance, exported or not", () => {
    const files = new Map([
      [
        "a.ts",
        `import { Bucket } from "@tsad/shapes";
const base = new Bucket({ name: "base" });
export const wrapper = { inner: base, again: base };
export { base };`,
      ],
    ]);
    const r = foldProject(files, hostOf("shapes"));
    const v = r.verdicts.get("a.ts");
    expect(v?.kind).toBe("fold");
    if (v?.kind !== "fold") return;
    const wrapper = v.exports.get("wrapper") as { inner: unknown; again: unknown };
    expect(wrapper.inner).toBe(wrapper.again);
    expect(v.exports.get("base")).toBe(wrapper.inner);
  });
  test("an exported construction re-exported under another name is still one instance", () => {
    const files = new Map([
      ["a.ts", `import { Bucket } from "@tsad/shapes";\nexport const a = new Bucket({ name: "a" });\nexport { a as b };`],
    ]);
    const v = foldProject(files, hostOf("shapes")).verdicts.get("a.ts");
    expect(v?.kind).toBe("fold");
    if (v?.kind === "fold") expect(v.exports.get("a")).toBe(v.exports.get("b"));
  });
  test("a later construction sees an earlier one, in source order", () => {
    const files = new Map([
      [
        "a.ts",
        `import { Bucket, Pair } from "@tsad/shapes";
const left = new Bucket({ name: "l" });
const pair = new Pair(left, "r");
export { pair };`,
      ],
    ]);
    const v = foldProject(files, hostOf("shapes")).verdicts.get("a.ts");
    expect(v?.kind).toBe("fold");
    if (v?.kind === "fold") {
      const pair = v.exports.get("pair") as { left: unknown };
      expect((pair.left as { props: { name: string } }).props.name).toBe("l");
    }
  });
  test("a construction that fails is skipped, and the reference to it rejects under step 1", () => {
    // `Missing` is not a class the host supplies, so revival cannot construct it.
    const files = new Map([
      ["a.ts", `import { Missing } from "@tsad/shapes";\nconst m = new Missing({});\nexport const wrapper = { m };`],
    ]);
    const v = foldProject(files, hostOf("shapes")).verdicts.get("a.ts");
    expect(v?.kind).toBe("run");
    if (v?.kind === "run") expect(v.rule).toBe("F-Eval-Ident");
  });
  test("the adapter reports the fixture shape", () => {
    expect(typeof referenceAdapter.foldProject).toBe("function");
  });
});
