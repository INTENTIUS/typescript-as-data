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
  test("chant's shape classifier is available (chant-v0.64.0+, chant#2362) and agrees on every fixture", () => {
    // The pinned chant carries the export, so "unavailable" would mean the adapter
    // silently stopped comparing the shape half — a real regression, asserted.
    for (const f of fixtures) {
      const s = chantAdapter.shape(f.input, f.exportName);
      expect(s, `${f.id}: chant shape classifier unavailable`).not.toBe("unavailable");
      if (s !== "unavailable") expect(s.accepted, `${f.id}: chant shape ${s.accepted ? "accept" : "reject"} ≠ expected ${f.shape}`).toBe(f.shape === "accept");
    }
  });
});
