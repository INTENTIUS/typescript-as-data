---
title: "The corpus cross-check"
description: "Running chant's whole example corpus through both implementations, the two named limits, and what the numbers mean."
weight: 5
aliases: ["/conformance/corpus/"]
---

`packages/conformance/src/corpus.ts` runs chant's example corpus through both
implementations and compares verdicts file by file, and export namespaces where
both folded. It is issue #25.

The module's own doc says why it exists. The fixtures in `spec/fixtures/` were
written to exercise particular rules, so agreement on them is agreement on
cases somebody chose. chant's example corpus was written for chant, so
agreement on it is agreement on cases the mechanism had no hand in choosing.

## Running it

The corpus is not in this repository and not in the published package, so the
check is inert without a chant checkout.

```bash
TSAD_CHANT_REPO=../chant npm run corpus
```

`TSAD_CHANT_REPO` must name a chant checkout whose dependencies are installed
and whose lexicons have been generated. There is no default, on purpose.

`corpus.ts` argues that a sibling checkout on a developer's machine is at
whatever commit they last pulled, and a gate that reads a moving corpus fails
for reasons that have nothing to do with the change under test. The number the
paper cites is taken at the pinned tag.

`npm run corpus` sets `TSAD_CORPUS_REPORT=1` and runs
`packages/conformance/src/corpus.test.ts`, which regenerates
`packages/conformance/corpus-report.md`. That file is the committed evidence
artifact, and its numbers come from the run.

Without `TSAD_CHANT_REPO`, the suite skips itself, and the skip is reported.

## Where the corpus comes from

The entries are the ones chant's own `examples/differential-corpus.ts`
enumerates, imported directly. It is the same list, lexicon
selection and intrinsic wiring that chant's own differentials use, so a corpus
entry added or a network fixture excluded on chant's side is picked up here
with no edit to this repository.

The reference is given chant's host, assembled from chant's own registries
rather than transcribed: the lexicon packages' real exports, the
authoring-helper allowlist and each entry's intrinsic registry. `corpus.ts`
gives the reason, and it is the same reason the port was removed from the
reference: a transcription would make the cross-check a test of the
transcription.

## The two limits

A file is comparable when nothing disarmed either implementation before the
comparison started. Two things do, and each is counted apart from the
agreement figure. `corpus.ts` defines them as a closed union of two and records
which side each disarms, because a limit can only make its own side refuse more.

| Limit | Disarms | What it is |
|---|---|---|
| `host` | the reference | The reference has no bindings for a package it cannot load. |
| `invocation` | the reference | A declarator calls a project export that is neither a declared function nor an interpretable composite, so F-Call step 6 would import and invoke it in open mode; the reference never invokes project code. |

Both limits are the reference's. chant is given each entry's lexicons and
build parameters through `foldProject`'s options, the inputs a real build
has.

A limit spreads. `corpus.ts` propagates each one along two edges: `F-Import`,
because a file that imports an unfoldable module cannot resolve what it
imported, and `F-Taint`, J3's edge, taken from the reference's own reported
taint source rather than recomputed, so the walk cannot disagree with the walk
it is classifying.

That spread over-approximates, and the module says so: a file may be in a
limited set and also have a real disagreement hiding under it. That is the cost
of the limit, and it is what bounds the whole measurement.

Limits are decided from syntax and the import table. Message wording is
explicitly non-normative under `F-Obs-Messages`, so
a classifier that read it would silently stop classifying the day the wording
changed.

The `invocation` limit reads the callee's declaration in the file the import
names. A declared function is never a limit, since F-Call step 2 folds or
refuses it by its body, and a refusal there is a verdict the two
implementations can disagree on.

## The numbers

From `paper/measurements.md`:

| Corpus | Files | Comparable | Agreed | Both fold, namespaces identical |
|---|---|---|---|---|
| chant <code>{{< figure "corpus.corpusVersion" >}}</code> at <code>{{< figure "corpus.revision" >}}</code>, {{< figure "corpus.entries" >}} entries | {{< figure "corpus.files" >}} | {{< figure "corpus.comparable" >}} | {{< figure "corpus.agreed" >}} | {{< figure "corpus.bothFold" >}} |

And the limit, from the same file: {{< figure "corpus.noHost" >}} file imports
a package the host cannot load.

`paper/measurements.md` states what this establishes: on
{{< figure "corpus.comparable" >}} files nobody wrote for the purpose, the two
implementations agree on every verdict, and on the {{< figure "corpus.bothFold" >}}
that fold on both sides the export namespaces are structurally identical,
entity class and properties included. This agreement was observed rather than
designed, the first between the two.

It also states the limit.
The comparable set is {{< figure "corpus.comparable" >}} of
{{< figure "corpus.files" >}}. Every limit is an over-approximation, so a file
under one may also be hiding a disagreement.

Namespace comparison is structural. `corpus.ts` compares entities rather than
skipping them, which is only sound because both implementations construct them
from the same host classes.

A namespace holding a function or a symbol has no structural encoding. It is
reported as `not-data`, and only the verdict is compared there.

## Codebases nobody here maintains

Every corpus entry above was written by the people who wrote the folder, and
chant's own docs say so. `packages/conformance/corpus-external.json` names
public checkouts nobody here maintains, pinned by revision.

The weekly job fetches them with `scripts/fetch-corpus-external.sh` and runs
every directory holding a `chant.config.ts` as an entry, with the lexicons,
build parameters and imported project files a build of that directory would
have. Their rows sit in their own section of the report and never inside the
totals.

## The data-host column

The corpus runs a third time when `evaluators/rust` is built. The evaluator
with no JavaScript runtime and the reference are both judged in `data-host` on
the same host description, which is the intrinsic registry and the trust set
with no code behind them.

At <code>{{< figure "corpus.revision" >}}</code> the two agree on all
{{< figure "corpus.dataHost.files" >}} files, and
{{< figure "corpus.dataHost.bothFold" >}} fold on both sides to the same
namespace, envelopes included.

## What the test asserts

`corpus.test.ts` has six assertions, and three of them guard against the check
passing vacuously.

1. The data-host column is present and agrees, unless a local run opts out of
   it by name. A missing evaluator must not read as a clean pass.
2. The corpus is the whole one: at least 100 entries and at least 380 files. A
   checkout whose dependencies are not installed, or a corpus discovery that
   returned less, would otherwise read as a clean run.
3. Every file is either comparable or limited by a named limit, and at least
   50 are comparable. `corpus.ts` records what that floor is for: the hostless
   first draft of this check compared 7 files, none of which folded on either
   side, which is agreement by vacuity.
4. The two implementations agree on every comparable file.
5. The reference never folds what chant runs, wherever chant was not disarmed.
   That one is asymmetric on purpose. A reference-side limit can only make the
   reference refuse more, so a fold the reference reaches and chant does not
   has no benign explanation unless a chant-side limit accounts for it.
6. The codebases nobody here maintains are all present at their pinned
   revision, each yields comparable files, and each agrees on every one not
   recorded in the manifest against an issue. A recorded disagreement must
   still be there.

## In CI

`.github/workflows/corpus.yml` runs it weekly, on Mondays early UTC, and on
`workflow_dispatch`.

The check itself takes under a second, but it can only run against a chant
checkout with its lexicon codegen artifacts generated, and generating those
means downloading a dozen upstream schemas. An upstream schema host being down
would fail the main gate on a change that has nothing to do with it.

The workflow checks out chant at the tag this repository pins and generates
the lexicon artifacts. Then it asserts that `examples/differential-corpus.ts`
exists before running the check, because a skipped suite passes and a checkout
that landed in the wrong place must not report as a clean cross-check.

The report is uploaded as an artifact on success and on failure both, so a
run with disagreements in it leaves its report behind.
