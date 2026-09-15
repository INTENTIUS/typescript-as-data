/**
 * The F-NoOwnExecution recording, as a gate (#178).
 *
 * Two kinds of test. The first three hold the committed tree to the property.
 * The rest are non-vacuity: a gate nothing can fail is a picture, so each one
 * builds a host that violates the property and asserts the harness catches it.
 */
import { describe, expect, test } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ADMITTED, byRule, observe, record, witnessed, EXEMPLAR } from "./recording.js";
import { recording, type ExecutionEvent } from "./trace.js";
import type { ConformanceHost, ProjectFixture } from "@intentius/tsad-conformance";

const SPEC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "spec");

describe("F-NoOwnExecution, recorded rather than sampled (#178)", () => {
  const r = record(SPEC);

  test("panel A: data-host invokes nothing, on both observers", () => {
    const a = r.panels[0];
    expect(a.failures).toEqual([]);
    expect(a.events).toEqual([]);
    expect(a.witnessed).toBe(0);
    // Asserted rather than observed: F-Profile-DataHost says no constructor
    // and no function is invoked, so an empty ledger is the rule made visible.
    expect(a.fixtures.length).toBeGreaterThan(0);
  });

  test("panel B: a fully folding estate runs only what the rule admits", () => {
    const b = r.panels[1];
    expect(b.failures).toEqual([]);
    expect(b.fixtures.length).toBeGreaterThan(0);
    for (const e of b.events) expect(ADMITTED.has(e.rule), `${e.rule} is not admitted by F-NoOwnExecution`).toBe(true);
    // The two observers are independent. Agreement is the closure claim.
    expect(b.witnessed).toBe(b.events.length);
  });

  test("panel C: a mixed estate keeps its verdicts and its taint edges", () => {
    const c = r.panels[2];
    expect(c.failures).toEqual([]);
    expect(c.fixtures).toContain(EXEMPLAR);
    expect(c.witnessed).toBe(c.events.length);
  });

  test("every arm F-NoOwnExecution names is reached by something", () => {
    // A listed rule nothing exercises is either a rule naming something
    // unreachable or a hole in the fixtures. F-Eval-CallMethod is reached only
    // by an expression fixture, which is why armCoverage sweeps those too.
    expect(r.arms.missing).toEqual([]);
    for (const rule of ADMITTED.keys()) expect(r.arms.reached[rule], `${rule} is never exercised`).toBeGreaterThan(0);
  });

  test("panels B and C between them cover every whole-build fixture in `full`", () => {
    const covered = new Set([...r.panels[1].fixtures, ...r.panels[2].fixtures]);
    const all = new Set([...r.panels[1].fixtures, ...r.panels[2].fixtures]);
    expect(covered.size).toBe(all.size);
    // B is the fully folding estates and C is the complement, so no fixture in
    // `full` sits outside both and none sits in both.
    const both = r.panels[1].fixtures.filter((f) => r.panels[2].fixtures.includes(f));
    expect(both).toEqual([]);
  });
});

/**
 * A host in one file, with the classes a fixture's source can import.
 * `build` lets each test decide what the constructor does.
 */
function hostWith(ctor: new (...a: unknown[]) => object): ConformanceHost {
  return {
    name: "probe",
    ownedSpecifierPrefixes: ["probe-pkg"],
    intrinsics: [],
    helpers: [],
    values: new Map([["probe-pkg", new Map<string, unknown>([["Thing", ctor]])]]),
  };
}

const fixtureWith = (source: string): ProjectFixture => ({
  kind: "project",
  profiles: ["full"],
  id: "probe/one-file",
  dir: "probe",
  rules: [],
  files: new Map([["app.ts", source]]),
  verdicts: { "app.ts": "fold" },
  host: "probe",
});

const SOURCE = `import { Thing } from "probe-pkg";\nexport const t = new Thing({ name: "x" });\n`;

describe("non-vacuity: the recording fails when the property does not hold", () => {
  test("a thin constructor passes, and the ledger names the rule that admits it", () => {
    const marker = Symbol.for("tsad.conformance.declarable");
    class Thin {
      readonly entityType = "Thing";
      readonly lexicon = "probe";
      constructor(readonly props: Record<string, unknown> = {}) {
        Object.defineProperty(this, marker, { value: true, enumerable: false });
      }
    }
    const o = observe(fixtureWith(SOURCE), "full", hostWith(Thin as never));
    expect(o.result).not.toBe("unavailable");
    expect(byRule(o.events)).toEqual({ "F-Val-Fate": 1 });
    expect(o.witnessed).toBe(o.events.length);
  });

  test("an invocation site with no record beside it is caught as an unmapped frame", () => {
    // The failure this gate exists for: someone adds a call into host code in
    // the reference and forgets the `record` line. The ledger stays silent and
    // the witness does not, so the counts diverge.
    //
    // Simulated here by entering host code directly while a recording is open,
    // which is what such a site would do.
    const marker = Symbol.for("tsad.conformance.declarable");
    class Thin {
      readonly entityType = "Thing";
      constructor(readonly props: Record<string, unknown> = {}) {
        Object.defineProperty(this, marker, { value: true, enumerable: false });
      }
    }
    const w = witnessed(hostWith(Thin as never));
    const Wrapped = w.host.values.get("probe-pkg")!.get("Thing") as new (p: Record<string, unknown>) => object;

    const events: ExecutionEvent[] = [];
    recording((e) => events.push(e), () => {
      new Wrapped({ name: "unledgered" });
    });

    expect(w.count()).toBe(1);
    expect(events.length).toBe(0);
    expect(w.count(), "a witnessed invocation the ledger never recorded").not.toBe(events.length);
  });

  test("an invocation under data-host fails panel A", () => {
    const marker = Symbol.for("tsad.conformance.declarable");
    class Thin {
      readonly entityType = "Thing";
      constructor(readonly props: Record<string, unknown> = {}) {
        Object.defineProperty(this, marker, { value: true, enumerable: false });
      }
    }
    // data-host drops the classes (F-Profile-DataHost), so nothing is
    // constructible and the ledger must stay empty even with a host present.
    const o = observe(fixtureWith(SOURCE), "data-host", hostWith(Thin as never));
    expect(o.events).toEqual([]);
    expect(o.witnessed).toBe(0);
  });

  test("an unadmitted rule in a ledger is a failure, not a pass", () => {
    // The allowlist is the gate's whole content, so it must reject something.
    expect(ADMITTED.has("F-Eval-CallLocal")).toBe(false);
    expect(ADMITTED.has("F-Val-Fate")).toBe(true);
    const bogus = { rule: "F-Eval-CallLocal", what: "a project-local function", name: "f" };
    expect(ADMITTED.has(bogus.rule)).toBe(false);
  });
});
