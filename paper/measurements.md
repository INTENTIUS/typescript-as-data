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
| chant `0.72.1` | 123, of which 61 are whole-build | 135 of 139 | all, on the 116 the pin answers; three are held out under chant#2441, one under chant#2446, and the four round-trip fixtures skip, chant having no generator |

The 4 rules without a fixture are listed in `spec/fixtures/UNCOVERED.md` with a reason each. All are properties no adapter can observe from verdicts: provenance, the host's own module tree, and what a host may vary or must not execute. One disagreement existed between the reference and chant, on an envelope inside a template span. The spec recorded the recommendation, chant-v0.68.0 implemented it, and a fixture now pins it (chant#2349).

**Two profiles.** Spec `1.1` names `full` and `data-host` (F-Profile, F-Profile-DataHost); the second is the specification for an evaluator with no JavaScript runtime, and it is what a platform in another language implements. Fixtures carry profile tags, and 76 of the 122 belong to `data-host`, and the reference judged in that profile passes every one of them. That is a JavaScript implementation passing a profile defined by the absence of JavaScript, so it establishes that the profile is consistent. Whether it is implementable without an engine is what `evaluators/rust` establishes (#86): `tsad-eval`, written from the text in Rust on oxc, passes every fixture tagged for the profile, the four round-trip fixtures among them since it generates as well as folds (F-Val-Source), and agrees with the reference on each, and over chant's corpus it sits as a third column, both evaluators judged in `data-host` on the same host description: at `chant-v0.71.0` the two agree on all 441 files, and 142 fold on both sides to the same namespace, envelopes included. Writing it found the reference reviving and tainting in a profile that does neither, both fixed in the reference; the corpus report records the column's numbers.

**Coercion, stated as fixtures.** Thirteen expression fixtures pin the parts of ECMAScript an evaluator in another language has to reproduce bit for bit. Number formatting in template literals is the largest of them (shortest round-trip digits; `1e+21`; `-0` as `0`; a literal beyond 2^53 rounded before it is printed). The others are `+`'s string-or-number dispatch and relational comparison on strings; the logical operators returning an operand; unary coercion and IEEE division; and the one deliberate departure, array spread refusing a string (R10.6). The same family pins that an `undefined`-valued property is present in the folded namespace and travels through a spread, which is what a selective-by-omission consumer reads (#82). Both implementations agree on all thirteen. Their sufficiency is not established by that: the reference is JavaScript and passes them for free, so whether they are enough is known only once an evaluator with no JavaScript engine runs them (#86).

**What this agreement is worth.** Until #50 the reference implementation's evaluation layer was a *port* of chant's, so agreement on expression-level fixtures was guaranteed by construction rather than observed. It is now written from `grammar.md` §2 and `judgments.md` J1 without consulting chant's source, and the two implementations agree on every fixture, so the comparison is between two codebases rather than one code base with itself.

## The corpus cross-check

`packages/conformance/src/corpus.ts` runs chant's example corpus through both implementations and compares verdicts file by file, and export namespaces where both folded (#25). The entries are the ones chant's own `examples/differential-corpus.ts` enumerates, imported rather than re-listed. The reference is given chant's host, assembled from chant's own registries: the lexicon packages' real exports, the authoring-helper allowlist and each entry's intrinsic registry. `npm run corpus` regenerates `packages/conformance/corpus-report.md`, which carries every number below.

| Corpus | Files | Comparable | Agreed | Both fold, namespaces identical |
|---|---|---|---|---|
| `chant-v0.70.1` at `730e7f7e`, 108 entries | 409 | 65 | 65 | 50 |
| `chant-v0.71.0` at `4ac9b08a`, 109 entries, before F-Call | 441 | 150 | 150 | 118 |
| `chant-v0.71.0` at `4ac9b08a`, 109 entries, with F-Call (#109) | 441 | 372 | 372 | 258 |
| `chant-v0.72.0` at `8ac99bc6`, 109 entries | 441 | 372 | 372 | 258 |
| `chant-v0.72.1` at `75c05827`, 109 entries, spec `1.6` | 441 | 440 | 440 | 304 |

A file is comparable when nothing disarmed either implementation before the comparison started. Four things did so under `chant-v0.70.1`, two under `chant-v0.71.0`, and one remains under spec `1.6`, the single file that imports a package the host cannot load, which is the reference's limit. Each of the others retired for its own reason. Two were limits of chant's entry point rather than of chant, 52 files reading a host data export that `foldProject` could not resolve without a lexicon list and 19 in entries with build parameters it could not be given, until chant#2422 gave it both (#96). Another held 290 files reaching a host factory until the reference implemented F-Call (#109). The final one held 68 files calling a package export outside a declarator; it went when spec `1.6` wrote chant's behaviour into F-Declarator and F-Call (#110).

**What this establishes.** On 440 files nobody wrote for the purpose, the two implementations agree on every verdict, and on the 304 that fold on both sides the export namespaces are structurally identical, entity class and properties included. It is agreement between the two that was observed rather than designed; each run since the first has widened the set it is observed on without adding a disagreement, and the fourth, at spec `1.6`, covers every file but one.

**Its limit.** 440 of 441 is the comparable set; the one file outside it imports a package the reference's host could not load, and a limit is an over-approximation, so that file may also be hiding a disagreement. Every run shares a larger limit. The implementation under test declares spec `1.0` while the rules are at `1.6` (the policy says an addition leaves an older minor's rules unchanged, and the suite holds the declaration to the same major), and it is the implementation the text was extracted from, so this is agreement with a rewrite written from the text rather than between two independent readings.

**What the fourth run settled (#110).** The first draft of the rule went too far. It admitted a package call in any position, so the reference folded five shapes chant refuses, and the fixture cross-check caught that before the corpus could. Probed shape by shape on `chant-v0.72.1`, a package call folds when a declarator reaches it through a const alias or as its own call's direct argument, and nowhere else; nested inside an object literal or an array it runs, and so does one inside a `new` or a tag's interpolation. Written down, that is F-Declarator's alias case together with F-Call's argument resolution. No J1 rule was added and `data-host` is untouched; 68 files entered the comparable set and every one agrees.

**Found on the way, third run (#109).** Implementing F-Call exposed 290 files, and three things fell out before the comparable set was clean. L6.1 lists a Declarable and a CompositeInstance among live objects and the reference's liveness test was prototype-only, so chant's composite instances, plain objects with a marker, failed step 7; the test now reads the marker the way F-Host-Interface item 1 describes it. The registration declarator `export const N = Composite(fn, "N")` is a function used as a value; the defining module therefore runs while callers interpret the body from source, which is what chant does and what one lexicon example pinned. F-Bind's destructured locals from a composite call had never been bound. What was left over, 68 files, is the fourth run's.

**Found on the way, second run.** Retiring the two limits exposed 79 more files, and 10 of them disagreed before any of it was a disagreement about the mechanism. Five were the harness binding `params` to the module's live export instead of the build's values, which F-Import's first arm forbids. Two were the reference never joining a `../` specifier to the importer's directory, so an import edge went unrecorded and with it a forward taint, and a file chant ran folded; the fix is in `project.ts`. Three were the reference deciding F-Capture only over the produced namespace, where F-Import's text records a capture at the import for any value with identity: a file that reads one string out of an imported object holds no object in its namespace and chant taints it anyway. The reference now does both, and every one of the ten agrees.

**The first run.** With no host, the first run compared 7 files and none of them folded on either side, which is agreement by vacuity. With a host it turned up a reference bug, a specification defect and a harness artifact. The bug was F-Capture's walk stopping at an entity's boundary, invisible without a host because an unrevived entity is a plain object; fixed, the reference reproduces `fold-adversarial`'s backward capture edge against a real host for the first time. The defect, #68, was that F-Eval-Ident step 1 read an instance "J2 pre-built" that no rule of J2 built, so the reference refused 22 files chant folds, and F-Prebuild now states the rule. The artifact was 21 files on which the harness had asked the two implementations different questions, now counted under the lexicon-list limit.


Two limits on that. The rewrite's author had read chant's implementation closely while writing the specification from it, so this establishes that the specification is complete enough to implement from, not that a reader who had never seen chant would arrive at the same place. And the agreement covers the expression and single-file layers. It does not cover J3, for the reason the next section gives.

**What the whole-build fixtures establish, and against how many implementations.** The reference implements J2's per-file verdict, J3's fixpoint and revival from the specification (#21, #22, #61). Thirty whole-build fixtures assert the verdicts of an entire build rather than the value of one expression, and four fire a taint edge on purpose:

| Fixture | What it fires |
|---|---|
| a file whose own body leaves `S-FnBody` | `F-Seed`, with no edge involved |
| an importer that runs, over a config that folds | `F-Succ` forward |
| a sibling that captured an object from a file the seed reached | `F-Succ` backward, at two hops |
| a file no edge reaches | `F-Taint`'s control, which must still fold |

The control is the one with teeth. An implementation that falls back on every file in a build with any fallback satisfies the other three and fails this, so the suite asserts it against a stub that does exactly that.

Until `chant-v0.70.1` chant had no entry that took a set of files, so none of these were answerable there: a taint edge does not exist inside a single file. chant#2408 added one, and the nine fixtures that need no host now run against both implementations. They agree on every file's final verdict and its tentative verdict, and for every taint casualty they agree on the file the edge came from and on which rule it was. Since `chant-v0.72.0` the fixtures that name a host reach chant too (chant#2438), and a skip fails the suite.

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
- Fixture coverage is 135 of 139 rules. The 4 without one are listed with a reason, and the list may only shrink.
- J3's whole-build fixtures reach both implementations, hosted or not, except three held out under chant#2441. Comparing verdicts alone would not be enough, since a seed and a taint casualty are both `run`; the tentative verdict and the taint edge are compared too.
- Revival is implemented for all six envelopes since #109; `{__compositeStep}` resolves the composite through F-Call. Isolation is honoured at F-Call step 5; step 6 in open mode, invoking a project module, is what the reference cannot answer (`packages/reference/CAVEATS.md`).
- The independent rewrite found two specification gaps. Two is a small sample, and it is the sample a single author working alone can produce.
