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
const fixtures = all;

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

  test("nothing is held out, and a future hold-out has to bring its guard", () => {
    // This replaces a loop over an empty list. Every hold-out retired — chant#2435
    // and chant#2441 to chant fixes, tsad#110 to spec 1.6 giving J1
    // `F-Eval-CallHost`, chant#2446, chant#2453 and chant#2455 to the 0.72.3 pin
    // and the adapter half — and what was left iterated `[]` behind a cast, so a
    // test named for checking hold-outs asserted nothing at all. Vacuously green
    // is the one thing a guard must never be.
    //
    // So the file states the live fact instead: chant answers every fixture. When
    // a hold-out is next needed it must carry its own guard, and the shape that
    // worked is in this file's history — assert the named fixtures still exist,
    // assert chant ANSWERS them (a skip is not agreement, because
    // `compareAdapters` reports nothing when one side is "unavailable"), and
    // assert they still disagree, so the list empties itself the moment its
    // reason is retired rather than outliving it.
    expect(
      fixtures.length,
      "a fixture is being filtered out of the comparison. Add its hold-out list back " +
        "with a guard that fails when its reason is settled, keyed on the issue that " +
        "explains it.",
    ).toBe(all.length);
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
