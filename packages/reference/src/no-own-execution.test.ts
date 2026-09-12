/**
 * F-NoOwnExecution (J4). The reference parses project source and reduces it;
 * it never runs a statement of it. Revival (#61) is the one place real code is
 * invoked, and what it invokes is the *host's* constructors and functions,
 * never anything the folded file wrote.
 *
 * Asserted by folding files whose top-level statements would be observable if
 * they ran.
 */
import { describe, test, expect } from "vitest";
import { requireHost } from "@intentius/tsad-conformance";
import { foldProject } from "./project";
import type { Host } from "./host";

const shapes = requireHost("shapes");
const host: Host = {
  intrinsics: shapes.intrinsics.map((i) => ({ name: i.name, isTag: i.isTag })),
  helpers: shapes.helpers,
  ownedSpecifierPrefixes: shapes.ownedSpecifierPrefixes,
  values: shapes.values,
};

declare global {
  // eslint-disable-next-line no-var
  var __tsadRan: string[] | undefined;
}

describe("F-NoOwnExecution", () => {
  test("a top-level side effect never runs, and the file folds anyway", () => {
    globalThis.__tsadRan = [];
    const files = new Map([
      [
        "sideEffects.ts",
        `import { Bucket } from "@tsad/shapes";\n` +
          `globalThis.__tsadRan.push("top level");\n` +
          `export const bucket = new Bucket({ name: "b" });\n`,
      ],
    ]);
    const v = foldProject(files, host).verdicts.get("sideEffects.ts");
    // The resource folds and revives into a real instance, which means the host
    // constructor ran...
    expect(v?.kind).toBe("fold");
    if (v?.kind === "fold") expect((v.exports.get("bucket") as { entityType: string }).entityType).toBe("Bucket");
    // ...and the file's own statement did not. Non-exported statements are
    // invisible to the gate precisely because they never execute.
    expect(globalThis.__tsadRan).toEqual([]);
  });

  test("a side effect in a called body is rejected, not executed", () => {
    globalThis.__tsadRan = [];
    const files = new Map([
      ["lib.ts", `export function helper() {\n  globalThis.__tsadRan.push("body");\n  return 1;\n}\nexport const marker = 1;\n`],
      ["caller.ts", `import { helper } from "./lib";\nexport const n = helper();\n`],
    ]);
    const r = foldProject(files, host);
    const v = r.verdicts.get("caller.ts");
    expect(v?.kind).toBe("run");
    // S-FnBody refuses the body rather than running it, and the forward edge
    // then takes lib.ts with it.
    expect(r.verdicts.get("lib.ts")?.kind).toBe("run");
    expect(globalThis.__tsadRan).toEqual([]);
  });

  test("a host constructor is the only thing revival calls", () => {
    const files = new Map([["a.ts", `import { Bucket } from "@tsad/shapes";\nexport const b = new Bucket({ n: 1 });\n`]]);
    const v = foldProject(files, host).verdicts.get("a.ts");
    expect(v?.kind).toBe("fold");
    if (v?.kind === "fold") {
      const b = v.exports.get("b") as { lexicon: string; props: unknown };
      expect(b.lexicon).toBe("shapes");
      expect(b.props).toEqual({ n: 1 });
    }
  });

  test("with no host, a resource cannot be revived and the file falls back", () => {
    // Correct rather than silent: a namespace holding an unrevived envelope is
    // not a folded file. F-Val-Fate has no arm that leaves one in place.
    const files = new Map([["a.ts", `import { Bucket } from "@tsad/shapes";\nexport const b = new Bucket({ n: 1 });\n`]]);
    const v = foldProject(files).verdicts.get("a.ts");
    expect(v?.kind).toBe("run");
    if (v?.kind === "run") {
      expect(v.rule).toBe("F-Val-Fate");
      expect(v.reason).toContain("Bucket");
    }
  });
});
