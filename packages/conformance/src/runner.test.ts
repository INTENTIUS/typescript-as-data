import { describe, test, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtures, runFixtures } from "./index";
import { referenceAdapter } from "@intentius/tsad-reference";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "spec", "fixtures");

describe("conformance runner (#7) over the reference implementation (#10)", () => {
  const fixtures = loadFixtures(fixturesDir);
  test("fixtures load", () => { expect(fixtures.length).toBeGreaterThan(0); for (const f of fixtures) expect(f.rules.length).toBeGreaterThan(0); });
  test("the reference implementation passes every fixture", () => {
    const reports = runFixtures(referenceAdapter, fixtures);
    const failed = reports.filter((r) => !r.pass).map((r) => `${r.fixture}: ${r.failures.join("; ")}`);
    expect(failed, failed.join("\n")).toEqual([]);
  });
  test("a stub adapter that folds everything to null fails the reject fixture and the value fixtures", () => {
    const stub = { name: "stub", shape: () => ({ accepted: true } as const), foldExport: () => ({ ok: true as const, value: null }) };
    const reports = runFixtures(stub, fixtures);
    expect(reports.some((r) => !r.pass)).toBe(true);
  });
});
