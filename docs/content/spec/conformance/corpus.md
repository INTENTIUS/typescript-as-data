---
title: "The corpus cross-check"
description: "Running chant's whole example corpus through both implementations, the one named limit, and what the numbers mean."
weight: 5
aliases: ["/conformance/corpus/"]
---

`packages/conformance/src/corpus.ts` runs chant's example corpus through both
implementations and compares verdicts file by file, and export namespaces where
both folded. It is issue #25.

The module's own doc says why it exists. The fixtures in `spec/fixtures/` were
written to exercise particular rules, so agreement on them is agreement on
cases somebody chose. chant's example corpus was not written for this purpose
at all, which is the only reason running it is worth anything.

## Running it

The corpus is not in this repository and not in the published package, so the
check is inert without a chant checkout.

```bash
TSAD_CHANT_REPO=../chant npm run corpus
```

`TSAD_CHANT_REPO` must name a chant checkout whose dependencies are installed
and whose lexicons have been generated. There is no default, on purpose:
`corpus.ts` argues that a sibling checkout on a developer's machine is at
whatever commit they last pulled, and a gate that reads a moving corpus fails
for reasons that have nothing to do with the change under test. The number the
paper cites is taken at the pinned tag.

`npm run corpus` sets `TSAD_CORPUS_REPORT=1` and runs
`packages/conformance/src/corpus.test.ts`, which regenerates
`packages/conformance/corpus-report.md`. That file is the committed evidence
artifact, and its numbers are produced by the run rather than typed in.

Without `TSAD_CHANT_REPO`, the suite skips itself, and the skip is reported
rather than silent.

## Where the corpus comes from

The entries are the ones chant's own `examples/differential-corpus.ts`
enumerates, imported rather than re-listed. It is the same list, lexicon
selection and intrinsic wiring that chant's own differentials use, so a corpus
entry added or a network fixture excluded on chant's side is picked up here
with no edit to this repository.

The reference is given chant's host, assembled from chant's own registries
rather than transcribed: the lexicon packages' real exports, the
authoring-helper allowlist and each entry's intrinsic registry. `corpus.ts`
gives the reason, and it is the same reason the port was removed from the
reference: a transcription would make the cross-check a test of the
transcription.

## The one limit

A file is comparable when nothing disarmed either implementation before the
comparison started. One thing does, and it is counted apart from the
agreement figure. `corpus.ts` defines it as a closed union of one and records
which side it disarms, because a limit can only make its own side refuse more.

| Limit | Disarms | What it is |
|---|---|---|
| `host` | the reference | The reference has no bindings for a package it cannot load. |

That limit is the reference's. chant is given each entry's lexicons and build
parameters through `foldProject`'s options, the inputs a real build has, since
chant#2422 (#96); before that two more limits stood for what its entry point
could not be told.

A limit spreads. `corpus.ts` propagates each one along two edges: `F-Import`,
because a file that imports an unfoldable module cannot resolve what it
imported, and `F-Taint`, J3's edge, taken from the reference's own reported
taint source rather than recomputed, so the walk cannot disagree with the walk
it is classifying.

That spread over-approximates, and the module says so: a file may be in a
limited set and also have a real disagreement hiding under it. That is the cost
of the limit, and it is what bounds the whole measurement.

Limits are decided from syntax and the import table, never from a rejection
message. Message wording is explicitly non-normative under `F-Obs-Messages`, so
a classifier that read it would silently stop classifying the day the wording
changed.

## The numbers

From `paper/measurements.md`:

| Corpus | Files | Comparable | Agreed | Both fold, namespaces identical |
|---|---|---|---|---|
| chant <code>{{< figure "corpus.corpusVersion" >}}</code> at <code>{{< figure "corpus.revision" >}}</code>, {{< figure "corpus.entries" >}} entries | {{< figure "corpus.files" >}} | {{< figure "corpus.comparable" >}} | {{< figure "corpus.agreed" >}} | {{< figure "corpus.bothFold" >}} |

And the limit, from the same file: {{< figure "corpus.noHost" >}} file imports a
package the host cannot load. Two limits retired on the way. The composite
one, which carved out two thirds of the corpus, went when F-Call was
implemented (#109); the value-position one, 68 files, went when spec `1.6`
wrote into F-Declarator and F-Call what chant already did with a package
call reached through a const alias or as a call's direct argument (#110).

`paper/measurements.md` states what this establishes: on
{{< figure "corpus.comparable" >}} files nobody wrote for the purpose, the two
implementations agree on every verdict, and on the {{< figure "corpus.bothFold" >}}
that fold on both sides the export namespaces are structurally identical,
entity class and properties included. This agreement was observed rather than
designed, the first between the two.

It also states the limit, and the limit is the more useful half.
{{< figure "corpus.comparable" >}} of {{< figure "corpus.files" >}} is the comparable set, not the corpus, and every limit is an over-approximation,
so a file under one may also be hiding a disagreement.

Namespace comparison is structural. `corpus.ts` compares entities rather than
skipping them, which is only sound because both implementations construct them
from the same host classes. It reads own data properties, enumerable or not,
and skips accessors, because an accessor can throw and computes a value rather
than holding one. A namespace holding something with no structural encoding at
all (a function or a symbol) is reported as `not-data`, and only the verdict is
compared there.

## The data-host column

The corpus runs a third time when `evaluators/rust` is built. The evaluator with no JavaScript runtime and the reference are both judged in `data-host` on the same host description, which is the intrinsic registry and the trust set with no code behind them. At <code>{{< figure "corpus.revision" >}}</code> the two agree on all {{< figure "corpus.dataHost.files" >}} files and {{< figure "corpus.dataHost.bothFold" >}} fold on both sides to the same namespace, envelopes included. The column measures the profile against itself in two languages; the comparable set above measures the reference against chant, which runs.

## What the test asserts

`corpus.test.ts` has four assertions, and two of them guard against the check
passing vacuously.

The corpus is the whole one, not a fragment of it: at least 100 entries and at
least 380 files. A checkout whose dependencies are not installed, or a corpus
discovery that quietly returned less, would otherwise read as a clean run.

Every file is either comparable or limited by a named limit, and at least 50
are comparable. `corpus.ts` records what that floor is for: the hostless first
draft of this check compared 7 files, none of which folded on either side,
which is agreement by vacuity.

The two implementations agree on every comparable file.

The reference never folds what chant runs, wherever chant was not disarmed.
This one is asymmetric on purpose. A reference-side limit can only make the
reference refuse more, so a fold the reference reaches and chant does not has
no benign explanation unless a chant-side limit accounts for it.

## What the first real run found

`paper/measurements.md` records it, and it is the argument for running a corpus
at all. The first run, with no host, compared 7 files; none of them folded
on either side. With a host it turned up a reference bug, a specification
defect and a harness artifact.

The bug was `F-Capture`'s walk stopping at an entity's boundary, invisible
without a host because an unrevived entity is a plain object. The defect is
issue #68: `F-Eval-Ident` step 1 read an instance as "J2 pre-built" that no
rule of J2 built, so the reference refused 22 files chant folds, and
`F-Prebuild` now states the rule. The artifact was 21 files on which the
harness had asked the two implementations different questions, counted under
a lexicon-list limit until chant#2422 retired it.

The second run had that limit and the build-parameters one gone; it exposed 79
more files and 10 of them disagreed. All ten were the harness or the
reference: build parameters bound to the module's live export, a `../`
specifier never joined to the importer's directory, and a capture decided over
the namespace alone where `F-Import` records it at the import.
`paper/measurements.md` lists them, and every one agrees now.

## In CI

`.github/workflows/corpus.yml` runs it weekly, on Mondays early UTC, and on
`workflow_dispatch`. It has no pull-request trigger and no push trigger, and the
workflow says why. The check itself takes under a second, but it can only run
against a chant checkout with its lexicon codegen artifacts generated, and
generating those means downloading a dozen upstream schemas. An upstream schema
host being down would fail the main gate on a change that has nothing to do
with it.

The workflow checks out chant at the tag this repository pins, generates the
lexicon artifacts, and then asserts that `examples/differential-corpus.ts`
exists before running the check, because a skipped suite passes and a checkout
that landed in the wrong place must not report as a clean cross-check. The
report is uploaded as an artifact on success and on failure both, since a run
with disagreements in it is the run whose report somebody wants to read.
