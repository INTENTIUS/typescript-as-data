import { describe, test, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtures, runFixtures, projectFixtures } from "./index";
import { referenceAdapter } from "@intentius/tsad-reference";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "spec", "fixtures");

describe("conformance runner (#7) over the reference implementation (#10)", () => {
  const fixtures = loadFixtures(fixturesDir);
  test("fixtures load", async () => { expect(fixtures.length).toBeGreaterThan(0); for (const f of fixtures) expect(f.rules.length).toBeGreaterThan(0); });
  test("the reference implementation passes every fixture", async () => {
    const reports = await runFixtures(referenceAdapter, fixtures);
    const failed = reports.filter((r) => !r.pass).map((r) => `${r.fixture}: ${r.failures.join("; ")}`);
    expect(failed, failed.join("\n")).toEqual([]);
  });
  test("the project fixtures are actually exercised, not all skipped (#24)", async () => {
    const reports = (await runFixtures(referenceAdapter, fixtures)).filter((r) => projectFixtures(fixtures).some((p) => p.id === r.fixture));
    expect(reports.length).toBe(projectFixtures(fixtures).length);
    expect(reports.filter((r) => r.skipped)).toEqual([]);
  });
  test("a stub adapter that runs every file fails the project fixtures that expect a fold", async () => {
    // The control the fixtures themselves describe: falling back everywhere is
    // sound and useless, and must not pass. Without this, F-Taint's "least set"
    // would be untested.
    const stub = {
      name: "always-runs", specVersion: "1.0", shape: () => "unavailable" as const,
      foldExport: () => ({ ok: false as const, line: 1, column: 1, message: "runs" }),
      foldProject: (files: Map<string, string>) => ({ verdicts: Object.fromEntries([...files.keys()].map((p) => [p, { kind: "run" as const, reason: "runs" }])) }),
    };
    const failed = (await runFixtures(stub, fixtures)).filter((r) => !r.pass && projectFixtures(fixtures).some((p) => p.id === r.fixture));
    expect(failed.length).toBeGreaterThan(0);
  });
  test("a stub adapter that folds everything to null fails the reject fixture and the value fixtures", async () => {
    const stub = { name: "stub", specVersion: "1.0", shape: () => ({ accepted: true } as const), foldExport: () => ({ ok: true as const, value: null }) };
    const reports = await runFixtures(stub, fixtures);
    expect(reports.some((r) => !r.pass)).toBe(true);
  });
});
