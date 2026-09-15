/**
 * F-NoOwnExecution, recorded rather than sampled (#178).
 *
 * The property is closure: for a file whose verdict is `fold`, none of its own
 * top-level statements runs, and what *does* run is a closed set the rule
 * names — "revival of envelopes (F-Val-Fate), F-Eval-CallEager,
 * F-Eval-CallMethod on a real receiver, and invocation of a package's factory
 * (J2 F-Call step 6)".
 *
 * chant's `test/leftness` profile is the wrong instrument for that claim twice
 * over. Its estate is required to fold completely, so it is a best case that
 * cannot show a fallback; and a `node --cpu-prof` figure has a sampling floor,
 * so its "0 MB" means "nothing the profiler could see" rather than "nothing
 * ran" (#177). Something does run: revival constructs entities through real
 * host classes.
 *
 * So this harness counts instead of sampling, and it counts twice.
 *
 * - The **ledger** is this package's own `trace` hook: every site in it
 *   which invokes code it did not write records the invocation with
 *   the rule that admits it.
 * - The **witness** is a counting Proxy around every callable the host
 *   supplies, which knows nothing about rules and only sees that it was
 *   called.
 *
 * Neither can see what the other sees. An invocation the witness counted and
 * the ledger missed is an unmapped frame: code ran through a path that claims
 * no rule, which is the violation the acceptance criteria ask to fail on.
 * Agreement of two independent counts is what makes this a gate rather than a
 * picture. The failure it is built to catch is a new invocation site added to
 * the reference without a `record` call beside it.
 *
 * WHAT NEITHER OBSERVER SEES. The witness wraps the callables the host
 * publishes, so it counts entries through the host map and nothing else. Host
 * code that calls a function it closed over privately is invisible to both:
 * the ledger was never told and the witness never wrapped it. That case is
 * F-Host-Interface item 1's to forbid rather than this harness's to detect,
 * and since spec 2.1 it does — a constructor holds its props and does no more.
 * The bound is normative and this instrument does not enforce it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recording, type ExecutionEvent } from "./trace.js";
import { referenceAdapter, referenceDataHostAdapter } from "./adapter.js";
import { requireHost, type ConformanceHost } from "@intentius/tsad-conformance";
import { loadFixtures, type Fixture, type ProjectFixture, type ExpressionFixture } from "@intentius/tsad-conformance";
import type { ExecutionCounters, ProjectResult } from "@intentius/tsad-conformance";

/**
 * The closed set, as `observables.md` names it. `F-Call` is step 6, the only
 * arm of that rule which invokes rather than interprets.
 *
 * `ι = executing` would add project-owned invocation and is absent here: the
 * reference reports that mode `unavailable` (CAVEATS.md), so no panel can
 * reach it.
 */
export const ADMITTED: ReadonlyMap<string, string> = new Map([
  ["F-Val-Fate", "revival of an envelope"],
  ["F-Eval-CallEager", "an eager intrinsic"],
  ["F-Eval-CallMethod", "a method on a real receiver"],
  ["F-Call", "a package's factory, step 6"],
]);

export interface Panel {
  readonly id: string;
  readonly title: string;
  /** What the panel establishes, in the terms of the rule. */
  readonly claim: string;
  readonly fixtures: readonly string[];
  /** The ledger, one entry per invocation, with the rule that admits it. */
  readonly events: readonly ExecutionEvent[];
  /** The witness: invocations the proxies actually saw. */
  readonly witnessed: number;
  readonly counters: ExecutionCounters;
  /** Every reason this panel fails. Empty is a pass. */
  readonly failures: readonly string[];
}

/** Invocations per admitting rule, for reading a panel back. */
export const byRule = (events: readonly ExecutionEvent[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const e of events) out[e.rule] = (out[e.rule] ?? 0) + 1;
  return out;
};

/**
 * The host with every callable it supplies wrapped in a counting Proxy.
 *
 * `construct` and `apply` are the two ways host code is entered: an entity
 * constructor is `new`ed (F-Host-Interface item 1) and an intrinsic, helper or
 * factory is called. A Proxy is transparent to both, so the fold is unchanged
 * and the count is exact.
 */
export function witnessed(h: ConformanceHost): { host: ConformanceHost; count: () => number } {
  let n = 0;
  const wrap = (v: unknown): unknown =>
    typeof v === "function"
      ? new Proxy(v, {
          apply: (t, thisArg, a) => { n += 1; return Reflect.apply(t as (...x: unknown[]) => unknown, thisArg, a); },
          construct: (t, a, nt) => { n += 1; return Reflect.construct(t as new (...x: unknown[]) => object, a, nt); },
        })
      : v;
  const values = new Map([...h.values].map(([spec, exports]) => [spec, new Map([...exports].map(([name, v]) => [name, wrap(v)]))]));
  return { host: { ...h, values }, count: () => n };
}

const isProject = (f: Fixture): f is ProjectFixture => f.kind === "project";

/** Every whole-build fixture, from the committed tree. */
export function projectFixtures(specDir: string): ProjectFixture[] {
  return loadFixtures(join(specDir, "fixtures")).filter(isProject);
}

const ZERO: ExecutionCounters = { factoryInvocations: 0, projectFactoryInvocations: 0, factoryInterpretations: 0 };
const add = (a: ExecutionCounters, b: ExecutionCounters | undefined): ExecutionCounters => ({
  factoryInvocations: a.factoryInvocations + (b?.factoryInvocations ?? 0),
  projectFactoryInvocations: a.projectFactoryInvocations + (b?.projectFactoryInvocations ?? 0),
  factoryInterpretations: a.factoryInterpretations + (b?.factoryInterpretations ?? 0),
});

/**
 * One fold, with both observers attached.
 *
 * `hostOverride` exists for the non-vacuity tests, which need a host the
 * committed tree does not contain: the gate is only worth running if a
 * violating host actually fails it.
 */
export function observe(f: ProjectFixture, profile: "full" | "data-host", hostOverride?: ConformanceHost) {
  const adapter = profile === "full" ? referenceAdapter : referenceDataHostAdapter;
  const base = hostOverride ?? (f.host ? requireHost(f.host) : undefined);
  const w = base ? witnessed(base) : undefined;
  const events: ExecutionEvent[] = [];
  const result = recording((e) => events.push(e), () => adapter.foldProject!(f.files, w?.host ?? base, f.mode));
  return { events, witnessed: w?.count() ?? 0, result: result as ProjectResult | "unavailable" };
}

/**
 * Panel A. `data-host`, where the rule is stated rather than measured:
 * `F-Profile-DataHost` says "No constructor and no function is invoked".
 * Zero is asserted on both observers, so the panel fails if anything runs.
 */
export function panelA(specDir: string): Panel {
  const fixtures = projectFixtures(specDir).filter((f) => f.profiles.includes("data-host"));
  const events: ExecutionEvent[] = [];
  const failures: string[] = [];
  let seen = 0;
  let counters = ZERO;
  for (const f of fixtures) {
    const o = observe(f, "data-host");
    if (o.result === "unavailable") continue;
    events.push(...o.events);
    seen += o.witnessed;
    counters = add(counters, o.result.counters);
    for (const e of o.events) failures.push(`${f.id}: ${e.what} "${e.name}" was invoked under data-host (${e.rule}); F-Profile-DataHost invokes no constructor and no function`);
    if (o.witnessed > 0) failures.push(`${f.id}: the host's callables were entered ${o.witnessed} time(s) under data-host`);
  }
  return {
    id: "A",
    title: "data-host invokes nothing",
    claim: "F-Profile-DataHost: no constructor and no function is invoked, asserted on both observers rather than observed",
    fixtures: fixtures.map((f) => f.id),
    events,
    witnessed: seen,
    counters,
    failures,
  };
}

/**
 * Panel B. `full`, over every whole-build fixture that folds completely.
 *
 * The gate: each ledger entry names a rule in {@link ADMITTED}, and the two
 * observers agree. An entry naming an unlisted rule, or a witnessed
 * invocation the ledger never recorded, fails the panel.
 */
export function panelB(specDir: string): Panel {
  const fixtures = projectFixtures(specDir).filter(
    (f) => f.profiles.includes("full") && Object.values(f.verdicts).length > 0 && Object.values(f.verdicts).every((v) => v === "fold"),
  );
  const events: ExecutionEvent[] = [];
  const failures: string[] = [];
  let seen = 0;
  let counters = ZERO;
  for (const f of fixtures) {
    const o = observe(f, "full");
    if (o.result === "unavailable") continue;
    events.push(...o.events);
    seen += o.witnessed;
    counters = add(counters, o.result.counters);
    for (const e of o.events) {
      if (!ADMITTED.has(e.rule)) failures.push(`${f.id}: ${e.what} "${e.name}" ran under ${e.rule}, which F-NoOwnExecution does not admit`);
    }
    if (o.witnessed !== o.events.length) {
      failures.push(
        `${f.id}: the witness counted ${o.witnessed} invocation(s) of host code and the ledger recorded ${o.events.length}. ` +
          `A witnessed invocation with no ledger entry is an unmapped frame: code ran through a path that names no rule.`,
      );
    }
    for (const [path, v] of Object.entries(o.result.verdicts)) {
      if (v.kind !== "fold") failures.push(`${f.id}: ${path} was expected to fold and did not (${v.rule})`);
    }
  }
  return {
    id: "B",
    title: "a fully folding estate runs only what the rule admits",
    claim: "F-NoOwnExecution: every invocation maps to a named rule, and two independent counts of them agree",
    fixtures: fixtures.map((f) => f.id),
    events,
    witnessed: seen,
    counters,
    failures,
  };
}

/**
 * Panel C. Mixed estates, which no recording in either repository has shown.
 *
 * `test/leftness` cannot produce one: its run fails unless every file reports
 * `[fold:fold]`, so it is necessarily a best case. Every whole-build fixture
 * that mixes the two verdicts is one, and `F-Succ/forward-into-imports` is the
 * exemplar — `config.ts` folds on its own and runs because `app.ts`, which
 * imports it, runs.
 *
 * The panel holds each fixture's per-file verdicts and taint edges to its own
 * expectation, so the demonstration and the conformance suite cannot drift
 * apart. What it establishes is that F-NoOwnExecution is per file: a
 * neighbour that runs licenses no execution inside a file that folds.
 */
export const EXEMPLAR = "F-Succ/forward-into-imports";

export function panelC(specDir: string): Panel {
  // The complement of panel B: every whole-build fixture that does not fold
  // completely. That includes the exemplar, whose two files both end at `run`
  // while `config.ts` folds tentatively and is taken by the forward edge —
  // the taint casualty that a fully folding estate can never show.
  const fixtures = projectFixtures(specDir).filter(
    (f) => f.profiles.includes("full") && Object.values(f.verdicts).some((v) => v === "run"),
  );
  const events: ExecutionEvent[] = [];
  const failures: string[] = [];
  let seen = 0;
  let counters = ZERO;
  if (!fixtures.some((f) => f.id === EXEMPLAR)) failures.push(`the exemplar ${EXEMPLAR} is not among the mixed estates`);
  for (const f of fixtures) {
    const o = observe(f, "full");
    if (o.result === "unavailable") continue;
    events.push(...o.events);
    seen += o.witnessed;
    counters = add(counters, o.result.counters);
    for (const [path, want] of Object.entries(f.verdicts)) {
      const got = o.result.verdicts[path];
      if (!got) failures.push(`${f.id}: no verdict reported for ${path}`);
      else if (got.kind !== want) failures.push(`${f.id}: ${path} expected ${want} and got ${got.kind}`);
    }
    for (const [path, from] of Object.entries(f.taintedBy ?? {})) {
      if (o.result.taintedBy?.[path] !== from) failures.push(`${f.id}: ${path} should be tainted by ${from} and is ${o.result.taintedBy?.[path] ?? "untainted"}`);
    }
    for (const e of o.events) {
      if (!ADMITTED.has(e.rule)) failures.push(`${f.id}: ${e.what} "${e.name}" ran under ${e.rule}, which F-NoOwnExecution does not admit`);
    }
    if (o.witnessed !== o.events.length) {
      failures.push(`${f.id}: the witness counted ${o.witnessed} invocation(s) and the ledger recorded ${o.events.length}, so a frame maps to no rule`);
    }
  }
  return {
    id: "C",
    title: "a mixed estate shows the run path and its taint casualties",
    claim: "F-NoOwnExecution is per file: a neighbour that runs licenses no execution inside a file that folds",
    fixtures: fixtures.map((f) => f.id),
    events,
    witnessed: seen,
    counters,
    failures,
  };
}

/**
 * Which arms of {@link ADMITTED} anything reaches, so the allowlist has no
 * dead entry. A rule listed by F-NoOwnExecution that nothing ever exercises is
 * either a rule naming something unreachable or a hole in the fixtures, and
 * both are worth failing on.
 *
 * `F-Eval-CallMethod` is reachable only at expression level: no whole-build
 * fixture calls a method on a real receiver, so the sweep below folds the
 * expression fixtures too rather than leave the arm unaccounted for.
 */
export function armCoverage(specDir: string, panels: readonly Panel[]): { reached: Record<string, number>; missing: string[] } {
  const reached: Record<string, number> = {};
  for (const r of ADMITTED.keys()) reached[r] = 0;
  for (const p of panels) for (const e of p.events) reached[e.rule] = (reached[e.rule] ?? 0) + 1;

  const expressions = loadFixtures(join(specDir, "fixtures")).filter((f): f is ExpressionFixture => f.kind === "expression" && f.profiles.includes("full"));
  for (const f of expressions) {
    const events: ExecutionEvent[] = [];
    try {
      recording((e) => events.push(e), () => referenceAdapter.foldExport!(f.input, f.exportName));
    } catch {
      continue;
    }
    for (const e of events) reached[e.rule] = (reached[e.rule] ?? 0) + 1;
  }
  return { reached, missing: [...ADMITTED.keys()].filter((r) => reached[r] === 0) };
}

export function record(specDir: string): { specVersion: string; panels: Panel[]; arms: ReturnType<typeof armCoverage> } {
  const panels = [panelA(specDir), panelB(specDir), panelC(specDir)];
  return {
    specVersion: readFileSync(join(specDir, "VERSION"), "utf8").trim(),
    panels,
    arms: armCoverage(specDir, panels),
  };
}
