/**
 * #173 — the purity probe fires. F-Host-Admission's first clause requires a
 * registered call be "a pure function of its arguments, no I/O, no environment
 * read", and F-Rule-Pure says that clause applied to rules is what the double
 * run of `collectFindings` tests. This is the same test on the fold, so it
 * needs the same proof: an adapter that reads the environment must fail it.
 */
import { describe, test, expect } from "vitest";
import { runProjectFixture } from "./runner.js";
import type { ConformanceAdapter, ProjectResult } from "./adapter.js";
import type { ProjectFixture } from "./fixture.js";

const fixture = {
  kind: "project",
  id: "probe/synthetic",
  dir: "",
  rules: [],
  profiles: ["full"],
  files: new Map([["app.ts", "export const x = 1;\n"]]),
  verdicts: { "app.ts": "fold" },
} as unknown as ProjectFixture;

const adapterReturning = (fn: () => ProjectResult): ConformanceAdapter =>
  ({ name: "probe", specVersion: "2.0", foldProject: () => fn() }) as unknown as ConformanceAdapter;

describe("the purity probe (#173)", () => {
  test("a fold that reads the environment fails F-Host-Admission", async () => {
    const impure = adapterReturning(() => ({
      verdicts: { "app.ts": { kind: "fold", exports: { x: process.env.STAGE ?? "unset" } } },
    }));
    const r = await runProjectFixture(impure, fixture);
    expect(r.pass).toBe(false);
    expect(r.failures.join("\n")).toContain("F-Host-Admission");
  });

  test("a fold that is not deterministic fails it too", async () => {
    let n = 0;
    const counting = adapterReturning(() => ({
      verdicts: { "app.ts": { kind: "fold", exports: { x: ++n } } },
    }));
    const r = await runProjectFixture(counting, fixture);
    expect(r.pass).toBe(false);
    expect(r.failures.join("\n")).toContain("differs between two folds");
  });

  test("a pure fold passes", async () => {
    const pure = adapterReturning(() => ({
      verdicts: { "app.ts": { kind: "fold", exports: { x: 1 } } },
    }));
    const r = await runProjectFixture(pure, fixture);
    expect(r.failures.filter((f) => f.includes("F-Host-Admission"))).toEqual([]);
  });

  test("the environment is restored afterwards", async () => {
    const before = process.env.STAGE;
    await runProjectFixture(
      adapterReturning(() => ({ verdicts: { "app.ts": { kind: "fold", exports: { x: 1 } } } })),
      fixture,
    );
    expect(process.env.STAGE).toBe(before);
  });
});
