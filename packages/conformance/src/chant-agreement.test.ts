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
// chant#2435 held S-CallLocal out of the shape half from spec 1.2 until
// chant-v0.72.0 admitted a project-local call in its classifier (#2437);
// nothing is held out of the shape comparison now, and a future hold-out
// needs a chant issue as its reason, the way this one had.
//
// chant#2441 — chant evaluates a helper or intrinsic call inside a folded
// function body, which F-Div-Depth (L3.16) says the folder must refuse, and
// produces the envelope the fixture's own note warns about. Unlike every other
// F-Div row this is not a fallback, so it is a chant bug rather than a
// tolerated divergence; these three are held out of the whole-build comparison
// by name until it is fixed, and by name rather than by rule so a new fixture
// citing F-Div-Depth is compared rather than silently excused.
const foldsAtDepth = new Set([
  "F-Eval-CallIntrinsic/inside-function-body",
  "F-Eval-CallHelper/inside-function-body",
  "F-Div-Provenance/helper-name-from-project-import",
]);

const heldOut = new Set([...foldsAtDepth]);
const fixtures = all.filter((f) => !heldOut.has(f.id));

describe("chant cross-check (#11)", () => {
  test("chant passes every fixture through its public fold API", async () => {
    const failed = (await runFixtures(chantAdapter, fixtures)).filter((r) => !r.pass).map((r) => `${r.fixture}: ${r.failures.join("; ")}`);
    expect(failed, failed.join("\n")).toEqual([]);
  });
  test("chant and the reference implementation agree on every fixture", async () => {
    const dis = await compareAdapters(referenceAdapter, chantAdapter, fixtures);
    expect(dis, dis.join("\n")).toEqual([]);
  });
  test("every whole-build fixture reaches chant (#62)", async () => {
    // This used to allow a skip when the fixture named a host, because a host's
    // entity classes came from a package chant's allowlist could not name
    // (chant#2408, chant#2438), and later because chant could not answer in
    // `isolated` at all (chant#2442). Both are fixed and the allowance is gone:
    // every project fixture is answered, so a skip is a failure rather than an
    // excuse. Three fixtures moved from skipped to answered when chant-v0.72.1
    // shipped, and the count is asserted so a silent return to "unavailable"
    // fails here instead of reading as agreement.
    const projects = projectFixtures(fixtures);
    expect(projects.length).toBeGreaterThan(0);
    const reports = await Promise.all(projects.map((f) => runProjectFixture(chantAdapter, f)));
    const skipped = reports.filter((r) => r.skipped).map((r) => r.fixture);
    expect(skipped, `chant answered none of these:\n${skipped.join("\n")}`).toEqual([]);
  });

  test("chant and the reference agree on every whole-build fixture chant can answer (#62)", async () => {
    const dis = await compareAdapters(referenceAdapter, chantAdapter, projectFixtures(fixtures));
    expect(dis, dis.join("\n")).toEqual([]);
  });

  test("every held-out fixture exists and still disagrees, so neither list outlives its reason", async () => {
    // A hold-out that quietly outlived its cause would be worse than the cause.
    // Run per list rather than over the union, so each empties itself on its
    // own event, so one reason cannot go on excusing another's fixtures.
    // (tsad#110's list emptied when spec 1.6 gave J1 F-Eval-CallHost.)
    for (const [reason, names] of [["chant#2441", foldsAtDepth]] as const) {
      const held = projectFixtures(all).filter((f) => names.has(f.id));
      expect(held.map((f) => f.id).sort(), `${reason}: a held-out fixture no longer exists`).toEqual([...names].sort());

      // A skip is not agreement. `compareAdapters` reports nothing when one
      // side answers "unavailable", so without this a chant that had stopped
      // answering hosted fixtures at all would read as "these now agree, drop
      // the hold-out" — exactly the false signal this guard exists to prevent,
      // one level up.
      const reports = await Promise.all(held.map((f) => runProjectFixture(chantAdapter, f)));
      const skipped = reports.filter((r) => r.skipped).map((r) => r.fixture);
      expect(skipped, `${reason}: chant answered none of these, so agreement cannot be read from them:\n${skipped.join("\n")}`).toEqual([]);

      const dis = await compareAdapters(referenceAdapter, chantAdapter, held);
      expect(dis.length, `${reason} looks settled — drop its hold-out`).toBeGreaterThan(0);
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
