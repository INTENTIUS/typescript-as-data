/** #11 — chant must pass the fixtures, and must agree with the reference implementation on every one. */
import { describe, test, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtures, runFixtures, runProjectFixture, compareAdapters, expressionFixtures, projectFixtures } from "./index";
import { chantAdapter } from "./adapters/chant";
import { referenceAdapter } from "@intentius/tsad-reference";

const fixtures = loadFixtures(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "spec", "fixtures"));

describe("chant cross-check (#11)", () => {
  test("chant passes every fixture through its public fold API", async () => {
    const failed = (await runFixtures(chantAdapter, fixtures)).filter((r) => !r.pass).map((r) => `${r.fixture}: ${r.failures.join("; ")}`);
    expect(failed, failed.join("\n")).toEqual([]);
  });
  test("chant and the reference implementation agree on every fixture", async () => {
    const dis = await compareAdapters(referenceAdapter, chantAdapter, fixtures);
    expect(dis, dis.join("\n")).toEqual([]);
  });
  test("the whole-build fixtures reach chant, or say why not (#62)", async () => {
    // Two reasons a project fixture can be skipped, and both must be visible.
    // An older pin has no whole-build entry at all (chant#2408); a fixture
    // naming a host asks for entity classes from a package chant cannot
    // resolve. Anything else has to be answered.
    const projects = projectFixtures(fixtures);
    expect(projects.length).toBeGreaterThan(0);
    const reports = await Promise.all(projects.map((f) => runProjectFixture(chantAdapter, f)));
    const skipped = reports.filter((r) => r.skipped).map((r) => r.fixture);
    const hosted = new Set(projects.filter((f) => f.host).map((f) => f.id));
    const unexpected = skipped.filter((id) => !hosted.has(id));
    if (chantAdapter.foldProject && (await chantAdapter.foldProject(new Map([["a.ts", "export const a = 1;"]]))) !== "unavailable") {
      expect(unexpected, `skipped without a host to explain it:\n${unexpected.join("\n")}`).toEqual([]);
    } else {
      // The pin predates chant#2408. Recorded, not silently tolerated.
      expect(skipped.length, "an older pin skips every whole-build fixture").toBe(projects.length);
    }
  });

  test("chant and the reference agree on every whole-build fixture chant can answer (#62)", async () => {
    const dis = await compareAdapters(referenceAdapter, chantAdapter, projectFixtures(fixtures));
    expect(dis, dis.join("\n")).toEqual([]);
  });
  test("chant's shape classifier is available (chant-v0.64.0+, chant#2362) and agrees on every fixture", async () => {
    // The pinned chant carries the export, so "unavailable" would mean the adapter
    // silently stopped comparing the shape half — a real regression, asserted.
    for (const f of expressionFixtures(fixtures)) {
      const s = chantAdapter.shape(f.input, f.exportName);
      expect(s, `${f.id}: chant shape classifier unavailable`).not.toBe("unavailable");
      if (s !== "unavailable") expect(s.accepted, `${f.id}: chant shape ${s.accepted ? "accept" : "reject"} ≠ expected ${f.shape}`).toBe(f.shape === "accept");
    }
  });
});
