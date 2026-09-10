/** #11 — chant must pass the fixtures, and must agree with the reference implementation on every one. */
import { describe, test, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtures, runFixtures, compareAdapters } from "./index";
import { chantAdapter } from "./adapters/chant";
import { referenceAdapter } from "@intentius/tsad-reference";

const fixtures = loadFixtures(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "spec", "fixtures"));

describe("chant cross-check (#11)", () => {
  test("chant passes every fixture through its public fold API", () => {
    const failed = runFixtures(chantAdapter, fixtures).filter((r) => !r.pass).map((r) => `${r.fixture}: ${r.failures.join("; ")}`);
    expect(failed, failed.join("\n")).toEqual([]);
  });
  test("chant and the reference implementation agree on every fixture", () => {
    const dis = compareAdapters(referenceAdapter, chantAdapter, fixtures);
    expect(dis, dis.join("\n")).toEqual([]);
  });
  test("reports whether chant's shape classifier was available", () => {
    const s = chantAdapter.shape(fixtures[0].input, fixtures[0].exportName);
    // Informational until INTENTIUS/chant#2362 ships; never a failure either way.
    console.log(`[#11] chant shape classifier: ${s === "unavailable" ? "unavailable (awaiting chant#2362)" : "available"}`);
    expect(true).toBe(true);
  });
});
