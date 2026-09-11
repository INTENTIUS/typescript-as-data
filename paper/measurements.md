# Measurements

Draft for #29. Every number cites the artifact it comes from. None is a coverage ratio; coverage is adoption, not mechanism (#26).

## The differential

`examples/fold-differential.test.ts` builds every corpus entry twice, folded and run, and requires identical errors and byte-identical serialised output (chant#1025).

The error half of that was unsound until chant-v0.69.1, because under the test runner a module that threw during import was cached as evaluated, so the second build of a directory in one process reported no error while every differential builds the same directory two or three times per process; `importModule` now remembers an evaluation failure and replays it, so error parity is compared rather than assumed (chant#2368).

- Until chant#2345 it compared only entries where every file folded, which are the builds in which J3 does nothing.
- Since chant-v0.65.0 it compares every non-empty entry.

The twelve mixed entries are the only builds in which `T(B) ≠ ∅`, and all twelve agree on both errors and bytes; drift counts the entries whose two builds differed on either.

| Run | Entries | Fully folded | Mixed | Drift |
|---|---|---|---|---|
| first mixed-entry run, chant PR #2364 | 107 | 95 | 12 | 0 |

The run's summary reported zero drift over the whole corpus, and all 111 tests in the file passed on that run.


## The adversarial entry

`examples/fold-adversarial/` (chant-v0.65.0, chant#2347) is nine files, each named for one resolution-time decision point and citing the inventory row that governs it. Four make J3 fire on purpose inside one build.

| File | Rule | Verdict |
|---|---|---|
| `taint-run-only-importer.ts` | `F-Seed` | run |
| `taint-shared-config.ts` | `F-Succ` forward | run |
| `taint-capturing-sibling.ts` | `F-Succ` backward | run |
| `taint-independent.ts` | `F-Taint`, `F-Fix` | fold |

The entry asserts each verdict by name and the differential holds across it. The other five cover `F-Div-Nullish`, the `?.` short-circuit, `F-Eval-Ident` shadowing, `F-Div-SpreadType` and `F-Depth`.

## The execution boundary

`test/leftness/` (chant#1084) expresses one estate in chant and again in CDK. It profiles both synths under `node --cpu-prof` and applies one analyser to both, with timing excluded by design.

| Measurement | `chant build --fold` | `cdk synth` |
|---|---|---|
| project code executed | false | true |
| definition-library code on the path | 0 MB | about 1.7 MB |

The chant side's `false` is also an unsampled invariant: the run fails unless every file reports `[fold:fold]`. This is the measurement for `F-NoOwnExecution`.

`examples/sandbox-execution-boundary.test.ts` (chant#1093) asserts over the corpus that under `{ fold: true, sandbox: true }` nothing from a project's source directory is imported into the CLI's process. `F-IsolatedRefusal` is measured here.

## The conformance cross-check

`packages/conformance` runs the spec's fixtures against the reference implementation and against chant through its public entry, pinned to a release.

| Pin | Fixtures | Rules with a fixture | Shape and fold agreement |
|---|---|---|---|
| chant 0.68.1 | 26 | 32 of 123 | all |

One disagreement existed between the reference and chant, on an envelope inside a template span. The spec recorded the recommendation, chant-v0.68.0 implemented it, and a fixture now pins it (chant#2349).

**What this agreement is worth.** Until #50 the reference implementation's evaluation layer was a *port* of chant's, so agreement on expression-level fixtures was guaranteed by construction rather than observed. It is now written from `grammar.md` §2 and `judgments.md` J1 without consulting chant's source, and the two implementations agree on every fixture, so the comparison is between two codebases rather than one code base with itself.

Two limits on that. The rewrite's author had read chant's implementation closely while writing the specification from it, so this establishes that the specification is complete enough to implement from, not that a reader who had never seen chant would arrive at the same place. And the reference covers the expression layer only: J2 and J3 are unimplemented there (#21, #22), so Theorem 1 still rests on one implementation.

The port's own failure mode is worth recording because it is the one this section should not paper over: chant-v0.69.0 extended an envelope check from three kinds to five while the port still had three, and because no fixture covered the shape, the suite stayed green against a stale port until the drift was found by reading the release diff. Two fixtures now cover it, and the port that made the drift possible is gone.

## What the specification found

Writing the specification against the implementation found defects the implementation's own tests had not.

| Finding | Where | Outcome |
|---|---|---|
| a property read on `null` folded to `undefined` where running throws | `fold.ts` | chant#2328, fixed in v0.63.0 |
| the differential skipped every mixed entry | `fold-differential.test.ts` | chant#2345, fixed in v0.65.0 |
| an envelope in a template span coerced to `"[object Object]"` on both paths | `fold.ts` | chant#2349, fixed in v0.68.0 |
| interpretation depth exhaustion degraded silently | `fold-import.ts` | chant#2370, fixed in v0.68.0 |
| three stale documentation claims, one in a shape the parity gate could not see | docs | chant#2306, #2348 |
| the forward taint edge stated backwards in the spec's own prose | `spec/requirements.md` | caught by writing `Succ` as an operator (#15) |
| four normative sentences used an *unclaimed* callee and none defined it | `spec/grammar.md` | found by writing the reference from the spec text; S-Unclaimed added (#51) |
| a backward-tainted file's fallback reason claims a file imports it, and none does | `discovery/fold-import.ts` | found by walking the adversarial build for the paper's worked example; `F-Obs-Report` requires naming the backward edge |
| a module that threw at import was cached as evaluated, so a second build in one process reported no error | `discovery/import.ts` | chant#2368, fixed in v0.69.1; found by the adversarial corpus entry this specification's inventory shaped |

## Negative results, kept

chant's fold-coverage history records that three predictions about what would unblock folding were wrong.

- the intrinsics wiring, called the single biggest lever, moved one entry
- the intrinsic call form moved eight
- lexicon package exports moved twenty-one
- constructions as values moved twenty-one more

The corpus is chant's own examples, and chant's documentation says the number is not an estimate for other codebases. Both statements stay in the paper.

## Limits

- Twelve mixed entries and one adversarial build are a small sample, all from one project.
- Fixture coverage is 32 of 123 rules, and the cross-file rules cannot have fixtures until the format grows (#24).
- The reference implementation does not implement the module layer or J3, so Theorem 1 has one implementation's evidence.
- The independent rewrite found one specification gap. One is a small sample, and it is the sample a single author working alone can produce.
