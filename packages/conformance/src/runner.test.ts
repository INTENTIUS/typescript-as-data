import { describe, test, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtures, runFixtures, projectFixtures, runProjectFixture, originAt, type ConformanceAdapter, type ProjectFixture } from "./index";
import { referenceAdapter, referenceDataHostAdapter } from "@intentius/tsad-reference";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "spec", "fixtures");

describe("conformance runner (#7) over the reference implementation (#10)", () => {
  const fixtures = loadFixtures(fixturesDir);
  test("fixtures load", async () => { expect(fixtures.length).toBeGreaterThan(0); for (const f of fixtures) expect(f.rules.length).toBeGreaterThan(0); });
  test("the reference implementation passes every fixture of the full profile", async () => {
    const reports = await runFixtures(referenceAdapter, fixtures.filter((f) => f.profiles.includes("full")));
    const failed = reports.filter((r) => !r.pass).map((r) => `${r.fixture}: ${r.failures.join("; ")}`);
    expect(failed, failed.join("\n")).toEqual([]);
  });
  test("the data-host profile: the reference passes every fixture tagged for it, a named host reduced to its description (#78)", async () => {
    const tagged = fixtures.filter((f) => f.profiles.includes("data-host"));
    expect(tagged.length).toBeGreaterThan(40);
    // A data-host fixture may name a host for its intrinsic registry and trust
    // set (F-Profile-DataHost, F-Host-Interface items 3 and 5); the adapter is
    // what drops the classes, helpers and values, and these fixtures are what
    // would fail if it did not.
    expect(tagged.some((f) => f.kind === "project" && f.host)).toBe(true);
    const failed = (await runFixtures(referenceDataHostAdapter, tagged)).filter((r) => !r.pass).map((r) => `${r.fixture}: ${r.failures.join("; ")}`);
    expect(failed, failed.join("\n")).toEqual([]);
  });
  test("the project fixtures are actually exercised, not all skipped (#24)", async () => {
    const reports = (await runFixtures(referenceAdapter, fixtures)).filter((r) => projectFixtures(fixtures).some((p) => p.id === r.fixture));
    expect(reports.length).toBe(projectFixtures(fixtures).length);
    // The one project fixture the reference may skip is the one judged under `executing` (spec 1.8), which asks for an invocation this package never performs (CAVEATS.md).
    expect(reports.filter((r) => r.skipped).map((r) => `${r.fixture}: ${r.skipped}`)).toEqual(["F-Call/executing-invokes-what-the-default-refuses: project entry unavailable"]);
  });
  test("a stub adapter that runs every file fails the project fixtures that expect a fold", async () => {
    // The control the fixtures themselves describe: falling back everywhere is
    // sound and useless, and must not pass. Without this, F-Taint's "least set"
    // would be untested.
    const stub = {
      name: "always-runs", specVersion: "1.1", shape: () => "unavailable" as const,
      foldExport: () => ({ ok: false as const, line: 1, column: 1, message: "runs" }),
      foldProject: (files: Map<string, string>) => ({ verdicts: Object.fromEntries([...files.keys()].map((p) => [p, { kind: "run" as const, reason: "runs" }])) }),
    };
    const failed = (await runFixtures(stub, fixtures)).filter((r) => !r.pass && projectFixtures(fixtures).some((p) => p.id === r.fixture));
    expect(failed.length).toBeGreaterThan(0);
  });
  test("a stub adapter that folds everything to null fails the reject fixture and the value fixtures", async () => {
    const stub = { name: "stub", specVersion: "1.1", shape: () => ({ accepted: true } as const), foldExport: () => ({ ok: true as const, value: null }) };
    const reports = await runFixtures(stub, fixtures);
    expect(reports.some((r) => !r.pass)).toBe(true);
  });
});

describe("F-Obs-Provenance plumbing (#236)", () => {
  const files = new Map([
    ["lib.ts", "export function svc(o: { port: number }) { return { port: o.port, proto: \"tcp\" }; }\n"],
    ["app.ts", "import { svc } from \"./lib\";\nexport const web = svc({ port: 80 });\nexport const direct = { n: 1 };\n"],
  ]);
  const fixture: ProjectFixture = {
    kind: "project", id: "inline/provenance", dir: "", rules: ["F-Obs-Provenance"], profiles: ["data-host"], files,
    verdicts: { "lib.ts": "fold", "app.ts": "fold" },
    provenance: { "app.ts": {
      "web.port": { kind: "composite-parameter", composite: "svc", parameters: ["port"] },
      "web.proto": { kind: "composite-literal", composite: "svc" },
      "direct.n": { kind: "direct" },
    } },
  };
  const folding = (provenance?: Record<string, Record<string, unknown>>, claims = true): ConformanceAdapter => ({
    name: "stub", specVersion: "2.2", ...(claims ? { provenance: true } : {}), shape: () => "unavailable", foldExport: () => ({ ok: true, value: null }),
    foldProject: () => ({ verdicts: { "lib.ts": { kind: "fold", exports: {} }, "app.ts": { kind: "fold", exports: {} } }, ...(provenance ? { provenance: provenance as never } : {}) }),
  });

  test("an adapter that does not claim provenance has the assertions skipped and reported", async () => {
    const r = await runProjectFixture(folding(undefined, false), fixture);
    expect(r).toMatchObject({ pass: true, skipped: "provenance unavailable", failures: [] });
  });
  test("an adapter that claims it and reports none fails", async () => {
    const r = await runProjectFixture(folding(undefined), fixture);
    expect(r.pass).toBe(false);
    expect(r.failures.join("\n")).toMatch(/claims provenance and reported none/);
  });
  test("an unknown reported as direct fails; a coarser ancestor governs the paths under it", async () => {
    const r = await runProjectFixture(folding({ "app.ts": { web: { kind: "unknown", reason: "x" }, direct: { kind: "direct" } } }), fixture);
    expect(r.failures).toEqual(["app.ts: web.port: origin unknown, expected composite-parameter", "app.ts: web.proto: origin unknown, expected composite-literal"]);
    expect(originAt({ 'a.tags': { kind: "direct" } }, 'a.tags["x.y"][0]')).toEqual({ kind: "direct" });
    expect(originAt({ 'a.tags["x.y"]': { kind: "direct" } }, 'a.tags["x.y"].z')).toEqual({ kind: "direct" });
    expect(originAt({ a: { kind: "direct" } }, "b.c")).toBeUndefined();
  });
  test("the reference claims provenance and passes the inline fixture in both profiles", async () => {
    for (const adapter of [referenceAdapter, referenceDataHostAdapter]) {
      expect(adapter.provenance).toBe(true);
      const r = await runProjectFixture(adapter, fixture);
      expect(r, r.failures.join("\n")).toMatchObject({ pass: true, failures: [] });
      expect(r.skipped).toBeUndefined();
    }
  });
});
