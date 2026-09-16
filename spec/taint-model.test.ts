/**
 * J3, checked rather than argued (#179).
 *
 * `taint.md` states a fixpoint and a proposition, and the proposition is
 * carried by a nine-line prose sketch. #180 found two defects in that sketch by
 * reading it. Every other claim in this repository is gated: rule-to-fixture
 * coverage in both directions, `UNCOVERED.md` shrink-only, three assertions in
 * `corpus.test.ts` whose only job is to stop the check passing vacuously. The
 * J3 proposition was the one place the project asserted instead.
 *
 * NOT ALLOY, deliberately. #179 proposed one and the method is what matters:
 * enumerate every build within a bounded scope and check the claim on each
 * rather than read a proof. Bounded enumeration does that, runs in the suite
 * everything else runs in, and adds no Java toolchain to CI.
 *
 * SCOPE, stated the way `F-Depth`'s bounds are, because a bounded check that
 * does not say its bound is worth nothing. Every build of exactly FILES files:
 * every import relation over them excluding self-imports, every capture
 * relation inside that import relation, every assignment of J2 tentative
 * verdicts. At four files that is 3^12 import-and-capture pairs times 16
 * verdict assignments, 8.5 million builds. A cycle, a diamond, and a chain of
 * three with a capture across it all fit inside four.
 *
 * Relations are bitmasks over `n²` slots and each check collects
 * counterexamples rather than asserting per build, because eight million
 * `expect` calls is minutes and one is milliseconds.
 */
import { describe, expect, test } from "vitest";

const FILES = 4;

/** A build: two relations as bitmasks over `n²`, and J2's tentative verdicts as one over `n`. */
interface Build {
  readonly n: number;
  readonly imports: number;
  readonly captures: number;
  readonly tentativeRun: number;
}

const bit = (n: number, f: number, g: number) => 1 << (f * n + g);
const has = (rel: number, n: number, f: number, g: number) => (rel & bit(n, f, g)) !== 0;

/**
 * `T(B) = μX . Seed(B) ∪ ⋃ Succ(f)` as a bitmask, by the worklist F-Fix permits.
 *
 * `Succ(f) = { g : f → g } ∪ { c : c ⇝ f }` — forward along imports from the
 * tainted file, backward along captures to whoever captured from it.
 */
function taint(b: Build): number {
  let t = b.tentativeRun; // F-Seed
  for (let changed = true; changed; ) {
    changed = false;
    for (let f = 0; f < b.n; f++) {
      if ((t & (1 << f)) === 0) continue;
      for (let g = 0; g < b.n; g++) {
        // forward along imports, and backward along captures
        const next = (has(b.imports, b.n, f, g) ? 1 << g : 0) | (has(b.captures, b.n, g, f) ? 1 << g : 0);
        if (next && (t & next) !== next) { t |= next; changed = true; }
      }
    }
  }
  return t;
}

const runs = (t: number, f: number) => (t & (1 << f)) !== 0;

/** Every build of exactly `n` files. Self-imports are excluded: not a shape J2 resolves. */
function* builds(n: number): Generator<Build> {
  const slots: number[] = [];
  for (let f = 0; f < n; f++) for (let g = 0; g < n; g++) if (f !== g) slots.push(f * n + g);
  const total = 1 << slots.length;
  for (let i = 0; i < total; i++) {
    let imports = 0;
    const present: number[] = [];
    for (let k = 0; k < slots.length; k++) if (i & (1 << k)) { imports |= 1 << slots[k]; present.push(slots[k]); }
    // captures ⊆ imports, which is the lemma holding by construction
    for (let j = 0; j < 1 << present.length; j++) {
      let captures = 0;
      for (let k = 0; k < present.length; k++) if (j & (1 << k)) captures |= 1 << present[k];
      for (let run = 0; run < 1 << n; run++) yield { n, imports, captures, tentativeRun: run };
    }
  }
}

/** Walk every build, collecting the first few builds where `bad` holds. */
function counterexamples(n: number, bad: (b: Build, t: number) => string | null, cap = 3): string[] {
  const out: string[] = [];
  for (const b of builds(n)) {
    const why = bad(b, taint(b));
    if (why) { out.push(why); if (out.length >= cap) return out; }
  }
  return out;
}

const show = (b: Build) => {
  const edges = (rel: number) => {
    const xs: string[] = [];
    for (let f = 0; f < b.n; f++) for (let g = 0; g < b.n; g++) if (has(rel, b.n, f, g)) xs.push(`${f}${g}`);
    return xs.join(",") || "-";
  };
  return `imports ${edges(b.imports)} captures ${edges(b.captures)} seed ${b.tentativeRun.toString(2)}`;
};

describe(`J3's fixpoint, over every build of ${FILES} files (#179)`, () => {
  test("T(B) is closed under Succ, which is what makes it the fixpoint", () => {
    expect(
      counterexamples(FILES, (b, t) => {
        for (let f = 0; f < b.n; f++) {
          if (!runs(t, f)) continue;
          for (let g = 0; g < b.n; g++) {
            if (has(b.imports, b.n, f, g) && !runs(t, g)) return `${show(b)}: ${f}→${g} unclosed`;
            if (has(b.captures, b.n, g, f) && !runs(t, g)) return `${show(b)}: ${g}⇝${f} unclosed`;
          }
        }
        return null;
      }),
    ).toEqual([]);
  });

  test("a runner never leaves a folded file below it: the forward edge holds", () => {
    // If `f` runs and imports `g`, its real import constructs `g`'s entities.
    // A folded `g` would be a second copy of each.
    expect(
      counterexamples(FILES, (b, t) => {
        for (let f = 0; f < b.n; f++) for (let g = 0; g < b.n; g++)
          if (has(b.imports, b.n, f, g) && runs(t, f) && !runs(t, g)) return `${show(b)}: ${f} runs, imports ${g}, ${g} folds`;
        return null;
      }),
    ).toEqual([]);
  });

  test("a capturer never outlives what it captured from: the backward edge holds", () => {
    // If `g` runs, the instance `f` captured during its fold is not the
    // instance the build collects, so `f`'s folded result is stale.
    expect(
      counterexamples(FILES, (b, t) => {
        for (let f = 0; f < b.n; f++) for (let g = 0; g < b.n; g++)
          if (has(b.captures, b.n, f, g) && runs(t, g) && !runs(t, f)) return `${show(b)}: ${f}⇝${g}, ${g} runs, ${f} folds`;
        return null;
      }),
    ).toEqual([]);
  });

  test("with the lemma, no running file holds a second object of a folded file's entity", () => {
    // Case 1 of the sketch gets `f → g` from `f ⇝ g` and the forward edge then
    // puts `g` in T. Every build here satisfies the lemma by construction,
    // since `captures ⊆ imports`.
    expect(
      counterexamples(FILES, (b, t) => {
        for (let f = 0; f < b.n; f++) for (let g = 0; g < b.n; g++)
          if (has(b.captures, b.n, f, g) && runs(t, f) && !runs(t, g)) return `${show(b)}: ${f}⇝${g}, ${f} runs, ${g} folds`;
        return null;
      }),
    ).toEqual([]);
  });
});

describe("the model is not vacuous", () => {
  test("a file that imports a running module still folds, which #179 asks for by name", () => {
    // `F-Import`'s project arm: "If `g`'s verdict is `run`, `n` is not resolved
    // and the reason is recorded against `n` for diagnostics only." L5.15: an
    // unresolved import never referenced does not force run.
    //
    // The sketch's case 2 asserted every importer of a running file runs, which
    // is #180's second defect. Taint flows from a tainted file to what it
    // IMPORTS and never to its importers, so this instance has to exist. A
    // model that cannot produce it is not modelling this specification.
    const found = counterexamples(3, (b, t) => {
      for (let f = 0; f < b.n; f++) for (let g = 0; g < b.n; g++)
        if (has(b.imports, b.n, f, g) && runs(t, g) && !runs(t, f)) return show(b);
      return null;
    }, 1);
    expect(found.length, "no build has an importer of a running file folding").toBe(1);
  });

  test("dropping the forward edge breaks the check, so passing it means something", () => {
    const brokenTaint = (b: Build): number => {
      let t = b.tentativeRun;
      for (let changed = true; changed; ) {
        changed = false;
        for (let f = 0; f < b.n; f++) {
          if ((t & (1 << f)) === 0) continue;
          for (let g = 0; g < b.n; g++)
            if (has(b.captures, b.n, g, f) && !runs(t, g)) { t |= 1 << g; changed = true; }
        }
      }
      return t;
    };
    let violated = false;
    for (const b of builds(3)) {
      const t = brokenTaint(b);
      for (let f = 0; f < b.n && !violated; f++) for (let g = 0; g < b.n; g++)
        if (has(b.imports, b.n, f, g) && runs(t, f) && !runs(t, g)) { violated = true; break; }
      if (violated) break;
    }
    expect(violated, "the forward edge is not doing any work in these checks").toBe(true);
  });

  test("dropping the backward edge breaks it too", () => {
    const brokenTaint = (b: Build): number => {
      let t = b.tentativeRun;
      for (let changed = true; changed; ) {
        changed = false;
        for (let f = 0; f < b.n; f++) {
          if ((t & (1 << f)) === 0) continue;
          for (let g = 0; g < b.n; g++)
            if (has(b.imports, b.n, f, g) && !runs(t, g)) { t |= 1 << g; changed = true; }
        }
      }
      return t;
    };
    let violated = false;
    for (const b of builds(3)) {
      const t = brokenTaint(b);
      for (let f = 0; f < b.n && !violated; f++) for (let g = 0; g < b.n; g++)
        if (has(b.captures, b.n, f, g) && runs(t, g) && !runs(t, f)) { violated = true; break; }
      if (violated) break;
    }
    expect(violated, "the backward edge is not doing any work in these checks").toBe(true);
  });
});

describe("the lemma `f ⇝ g` implies `f → g` is load-bearing", () => {
  test("without it the proposition is violable, which is why taint.md states it", () => {
    // A capture that is not an import. `f` runs and reconstructs the entity by
    // real execution while `g` still folds and holds its own object: two
    // objects for one entity, which is exactly what the proposition forbids.
    // `taint.md` states the lemma and never checks it.
    const b: Build = { n: 2, imports: 0, captures: bit(2, 0, 1), tentativeRun: 0b01 };
    const t = taint(b);
    expect(runs(t, 0), "the capturer runs").toBe(true);
    expect(runs(t, 1), "the captured-from file folds, holding a second object").toBe(false);
  });
});
