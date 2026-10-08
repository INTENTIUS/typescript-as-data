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
// chant#2441 held F-Eval-CallHelper/inside-function-body out until
// chant-v0.72.3: chant cannot take a host's declared helper names, so the
// call inside the function body did not fold, and chant then invoked the
// function instead of refusing it. chant#2453's fix removed the invocation,
// so both implementations now run the file, by different routes, and the
// verdicts agree. The list held three fixtures once; see the history.

// chant#2446, chant#2453 and chant#2455 all retired at the chant-v0.72.3 pin.
// The counters are on chant's public entry, the strict default is chant's, and
// `executing` is a build option the adapter maps ι onto — so all three fixtures
// answer and agree, and nothing about them is held out. A future hold-out needs
// a chant issue as its reason, the way each of these had.
// chant#3329 held F-Call/a-call-result-read-inside-an-argument out until
// chant-v0.109.0: the pin predated the fold of a same-file call's result read
// inside an argument (spec 2.2, F-Call step 6).
//
// chant#3610 held two F-Call fixtures out until chant-v0.110.0, which carries
// chant#3618. chant-v0.109.0 kept a call result an argument resolved bound for
// the rest of the file, and did not count a host composite's result as an
// instance.
//
// tsad#248 held three provenance fixtures out until chant-v0.110.0. chant#3619
// reports a host call or host value in a resource field as unknown, so the
// field fixture agrees. A non-resource export such as `export const k =
// count([1, 2])` still has no provenance record in chant at all, a limit
// chant#3619 states, so the two fixtures that assert an export's origin stay
// held. Those differ from the fixture only, never from the reference's
// verdict, so the guard below reads chant's own report too.
const HELD: readonly (readonly [string, Set<string>])[] = [
  ["chant#3619 (no provenance for a non-resource export)", new Set(["F-Obs-Provenance/a-host-call-at-an-export-is-unknown", "F-Obs-Provenance/a-host-value-is-unknown"])],
];
const heldIds = new Set(HELD.flatMap(([, names]) => [...names]));
const fixtures = all.filter((f) => !heldIds.has(f.id));

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
    // F-Obs-Provenance is optional (spec 2.2): a chant that does not claim it
    // still answers the build, and only the provenance assertions skip. That
    // skip is a declaration rather than a gap, and it is the only one allowed.
    const otherThanProvenance = (s: string | undefined) => (s ?? "").split("; ").filter((x) => x && !(x === "provenance unavailable" && !chantAdapter.provenance));
    const skipped = reports.filter((r) => otherThanProvenance(r.skipped).length > 0).map((r) => `${r.fixture}: ${r.skipped}`);
    expect(skipped, `chant answered none of these:\n${skipped.join("\n")}`).toEqual([]);
    const provenanceFixtures = projects.filter((f) => f.provenance).map((f) => f.id);
    expect(provenanceFixtures.length).toBeGreaterThan(0);
    if (!chantAdapter.provenance) {
      const declared = reports.filter((r) => r.skipped?.split("; ").includes("provenance unavailable")).map((r) => r.fixture);
      expect(declared.sort()).toEqual(provenanceFixtures.sort());
    }
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
    for (const [reason, names] of HELD) {
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

      // Each fixture on its own, so one that still disagrees cannot excuse
      // another that has settled. A fixture still disagrees when chant differs
      // from the reference or fails the fixture's own assertions.
      for (const f of held) {
        const dis = await compareAdapters(referenceAdapter, chantAdapter, [f]);
        const report = reports.find((r) => r.fixture === f.id)!;
        expect(dis.length > 0 || !report.pass, `${reason}: ${f.id} looks settled — drop its hold-out`).toBe(true);
      }
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
