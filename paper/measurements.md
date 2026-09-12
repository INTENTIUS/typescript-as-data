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
| chant 0.70.1 | 44, of which 14 are whole-build | 61 of 127 | all, on the 39 the pin can answer |

One disagreement existed between the reference and chant, on an envelope inside a template span. The spec recorded the recommendation, chant-v0.68.0 implemented it, and a fixture now pins it (chant#2349).

**What this agreement is worth.** Until #50 the reference implementation's evaluation layer was a *port* of chant's, so agreement on expression-level fixtures was guaranteed by construction rather than observed. It is now written from `grammar.md` §2 and `judgments.md` J1 without consulting chant's source, and the two implementations agree on every fixture, so the comparison is between two codebases rather than one code base with itself.

## The corpus cross-check

`packages/conformance/src/corpus.ts` runs chant's example corpus through both implementations and compares verdicts file by file, and export namespaces where both folded (#25). The entries are the ones chant's own `examples/differential-corpus.ts` enumerates, imported rather than re-listed. The reference is given chant's host, assembled from chant's own registries: the lexicon packages' real exports, the authoring-helper allowlist and each entry's intrinsic registry. `npm run corpus` regenerates `packages/conformance/corpus-report.md`, which carries every number below.

| Corpus | Files | Comparable | Agreed | Both fold, namespaces identical |
|---|---|---|---|---|
| chant-v0.70.1 at `730e7f7e`, 108 entries | 409 | 65 | 65 | 50 |

A file is comparable when nothing disarmed either implementation before the comparison started. Four things do, and each is counted apart from the agreement figure. 272 files reach a composite factory call, a form the reference does not implement. 52 read a host data export as a value, which chant's whole-build entry cannot resolve because it takes no lexicon list, so F-Host-Trust arm 1 is off on its side exactly as L9.4 requires. 19 sit in entries that declare build parameters, which the same entry point cannot be given. 1 imports a package the host cannot load. The first is a limit of the reference; the middle two are limits of chant's entry point rather than of chant.

**What this establishes.** On 65 files nobody wrote for the purpose, the two implementations agree on every verdict, and on the 50 that fold on both sides the export namespaces are structurally identical, entity class and properties included. It is the first agreement between the two that was observed rather than designed.

**Its limit.** 65 of 409 is the comparable set, not the corpus, and every limit is an over-approximation, so a file under one may also be hiding a disagreement. The composite limit alone removes two thirds of the corpus, and the most common form in real projects is therefore the one the cross-check cannot yet speak to.

**Found on the way.** The first run, with no host, compared 7 files and none of them folded on either side, which is agreement by vacuity. With a host it turned up a reference bug, a specification defect and a harness artifact. The bug was F-Capture's walk stopping at an entity's boundary, invisible without a host because an unrevived entity is a plain object; fixed, the reference reproduces `fold-adversarial`'s backward capture edge against a real host for the first time. The defect is #68: F-Eval-Ident step 1 read an instance "J2 pre-built" that no rule of J2 built, so the reference refused 22 files chant folds, and F-Prebuild now states the rule. The artifact was 21 files on which the harness had asked the two implementations different questions, now counted under the lexicon-list limit.


Two limits on that. The rewrite's author had read chant's implementation closely while writing the specification from it, so this establishes that the specification is complete enough to implement from, not that a reader who had never seen chant would arrive at the same place. And the agreement covers the expression and single-file layers. It does not cover J3, for the reason the next section gives.

**What the whole-build fixtures establish, and against how many implementations.** The reference implements J2's per-file verdict, J3's fixpoint and revival from the specification (#21, #22, #61). Thirteen whole-build fixtures assert the verdicts of an entire build rather than the value of one expression, and four fire a taint edge on purpose:

| Fixture | What it fires |
|---|---|
| a file whose own body leaves `S-FnBody` | `F-Seed`, with no edge involved |
| an importer that runs, over a config that folds | `F-Succ` forward |
| a sibling that captured an object from a file the seed reached | `F-Succ` backward, at two hops |
| a file no edge reaches | `F-Taint`'s control, which must still fold |

The control is the one with teeth. An implementation that falls back on every file in a build with any fallback satisfies the other three and fails this, so the suite asserts it against a stub that does exactly that.

Until `chant-v0.70.1` chant had no entry that took a set of files, so none of these were answerable there: a taint edge does not exist inside a single file. chant#2408 added one, and the nine fixtures that need no host now run against both implementations. They agree on every file's final verdict and its tentative verdict, and for every taint casualty they agree on the file the edge came from and on which rule it was. The four that name a host still reach one implementation, their entity classes coming from a package chant cannot resolve, and a skip with no host to explain it fails the suite.

Two agreements are worth naming. chant classifies the capturing sibling as reached by a capture rather than an import, the distinction chant#2406 was filed for. And a file whose only tie to another is a call returning computed plain data folds in both, which is `F-Identity`'s entity test holding in an implementation that has never read it.

Writing J2 and J3 from the specification found one more gap in it, which that test is the resolution of. `F-Import` and `F-Val-Live` stated two identity predicates and nothing said they answer different questions, so either choice for both uses is wrong, in one direction unsoundly. `F-Identity` makes the recursive test normative and `F-Import`'s broader one an over-approximation whose cost is coverage (#59).

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
| two identity predicates stated for captures and never reconciled | `spec/judgments.md`, `spec/values.md` | found by writing J2 and J3 from the spec text; F-Identity added (#59) |
| no public entry folds a whole project, so J3 is not testable from outside | `@intentius/chant` | chant#2408, open |
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
- Fixture coverage is 58 of 126 rules. The 68 without one are listed with a reason, and the list may only shrink.
- J3's whole-build fixtures reach both implementations where no host is involved, and one where a host is. Comparing verdicts alone would not be enough, since a seed and a taint casualty are both `run`; the tentative verdict and the taint edge are compared too.
- Revival is implemented for five of the six envelopes; `{__compositeStep}` needs a composite factory form the reference does not have (`packages/reference/CAVEATS.md`).
- The independent rewrite found two specification gaps. Two is a small sample, and it is the sample a single author working alone can produce.
