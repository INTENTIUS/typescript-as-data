/** #11 — chant must pass the fixtures, and must agree with the reference implementation on every one. */
import { describe, test, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtures, runFixtures, runProjectFixture, compareAdapters, expressionFixtures, projectFixtures } from "./index";
import { chantAdapter } from "./adapters/chant";
import { referenceAdapter } from "@intentius/tsad-reference";

// chant implements the full profile; a fixture tagged for data-host only
// (S-ExportDefault, which full keeps under S-Disqualify until chant admits it)
// is not chant's to answer.
const all = loadFixtures(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "spec", "fixtures")).filter((f) => f.profiles.includes("full"));
// chant's classifier rejects every project-local call the build folds
// (chant#2435), the direction F-Direction forbids; spec 1.2's S-CallLocal
// names the form. Fixtures citing it are held out of the shape comparison,
// and only that: their fold half is still compared below.
const knownShapeDivergence = new Set(["S-CallLocal"]);
const heldOut = all.filter((f) => f.rules.some((r) => knownShapeDivergence.has(r)));
const fixtures = all.filter((f) => !heldOut.includes(f));

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
    expect(unexpected, `skipped without a host to explain it:\n${unexpected.join("\n")}`).toEqual([]);
    // The pin carries the entry, so "unavailable" everywhere would mean the
    // comparison silently stopped happening. Asserted, not assumed.
    expect(skipped.length, "every hostless whole-build fixture must reach chant").toBeLessThan(projects.length);
  });

  test("chant and the reference agree on every whole-build fixture chant can answer (#62)", async () => {
    const dis = await compareAdapters(referenceAdapter, chantAdapter, projectFixtures(fixtures));
    expect(dis, dis.join("\n")).toEqual([]);
  });
  test("the held-out fixtures still agree on the fold half, and the hold-out is not empty (chant#2435)", () => {
    expect(heldOut.length).toBeGreaterThan(0);
    for (const f of expressionFixtures(heldOut)) {
      const a = referenceAdapter.foldExport(f.input, f.exportName), b = chantAdapter.foldExport(f.input, f.exportName);
      expect(a.ok, `${f.id}: reference ${a.ok ? "folds" : "runs"}, chant ${b.ok ? "folds" : "runs"}`).toBe(b.ok);
    }
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
