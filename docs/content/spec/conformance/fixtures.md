---
title: "The fixture format"
description: "The three kinds of conformance fixture, expression, project and round-trip, with an example of each from spec/fixtures/."
weight: 2
aliases: ["/conformance/fixtures/"]
---

A fixture is a directory under `spec/fixtures/<Rule>/<name>/`. The format is
defined in `packages/conformance/src/fixture.ts`, which is also the loader and
tells an expression fixture from a project one, and either from a round-trip
one, by what the directory contains.

Every fixture's `expect.json` carries a `rules` array naming the identifiers
the fixture exercises. That array is what the
[coverage gate](/typescript-as-data/spec/conformance/coverage/) reads in both
directions, so it is not decoration. Most carry a `note` saying why the fixture
exists.

## Expression fixtures

An expression fixture judges one export of one file. The directory holds
`input.ts` and `expect.json`.

`spec/fixtures/S-Template/const-span/input.ts`:

```ts
const name = "World";
export const x = `Hello ${name}!`;
```

`spec/fixtures/S-Template/const-span/expect.json`:

```json
{ "rules": ["S-Template", "F-Eval-Template", "F-Eval-Ident"], "export": "x", "shape": "accept", "fold": "fold", "value": "Hello World!",
  "note": "The claim chant#2306 found stated backwards in the docs: a template interpolating a const folds." }
```

`export` names which export is judged. `shape` is the `S-*` verdict, `"accept"`
or `"reject"`. `fold` is the `F-*` verdict, `"fold"` or `"run"`. `value` is
required when `fold` is `"fold"`, and the sentinel `"$undefined"` means the
folded value is `undefined`, which JSON cannot write. `rejectAt` is optional
and only meaningful when `fold` is `"run"`: it is the line and column the
rejection must point at, which is `F-Reason`'s located-rejection requirement
made testable.

Both verdicts are checked on every fixture, so a fixture exercises the shape
classifier and the folder at once. `F-Direction` is the reason that is worth
doing: the classifier may accept what the folder rejects and never the reverse.
A fixture with `"shape": "accept"` and `"fold": "run"` is therefore a
legitimate and interesting shape.

## Project fixtures

A project fixture judges every file of a small build, which is what J3 needs: a
taint edge cannot be seen in one file. The directory holds a `project/`
subdirectory with one or more `.ts` files, nesting allowed, and `expect.json`
with `"project": true`.

`spec/fixtures/F-Succ/forward-into-imports/project/config.ts`:

```ts
export const settings = { port: 8080 };
```

`spec/fixtures/F-Succ/forward-into-imports/project/app.ts`:

```ts
import { settings } from "./config";

export function ensure(p: number) {
  if (p > 0) {
    return p;
  }
  return 1;
}

export const port = ensure(settings.port);
```

`spec/fixtures/F-Succ/forward-into-imports/expect.json`:

```json
{
  "rules": ["F-Succ", "F-Taint", "F-Import"],
  "project": true,
  "verdicts": { "app.ts": "run", "config.ts": "run" },
  "tentative": { "app.ts": "run", "config.ts": "fold" },
  "taintedBy": { "config.ts": "app.ts" },
  "note": "The forward edge. config.ts folds on its own, and runs anyway because app.ts, which imports it, runs: app.ts's real import would construct a second settings object. This is chant#1107's observation, that fixing a leaf buys nothing while an importer still runs."
}
```

`verdicts` is every file's final verdict, after J3. `tentative` is J2's
proposal, before J3 disposed of it, and is optional because an implementation
that cannot separate the two phases reports none. `taintedBy` gives, for a file
J3 tainted, the file whose taint reached it. `exports` is optional and gives
expected export values for files that finally fold. `rejectRule` names the rule
a `run` verdict must cite, and is checked only when the adapter reports one.
`host` selects one from `packages/conformance/src/host.ts`, and is required
for any fixture whose sources import one. `mode` is J2's isolation mode,
`open` by default, `isolated` or `executing`; an adapter that cannot honour it
reports the fixture unavailable. `findings` is what an `F-Rule-*` fixture
asserts: the named host's rules' findings as data. A finding matches on its
rule and subject and on its severity. `counters` pins F-Obs-Counters' three
integers for the build, and an adapter reporting none is skipped there rather
than failed. `profiles` names the profiles the case is judged in. Without it
one that needs the runtime is `full` only, which naming a host or
asserting a taint edge implies; anything else is judged in both.

`fixture.ts` says why `tentative` and `taintedBy` exist. Without them a project
fixture cannot tell "folds because nothing reached it" from "would have folded,
and an edge killed it". Both of those produce the verdict `run`, so comparing
verdicts alone would not distinguish a seed from a taint casualty. The fixture
above is exactly that case. `config.ts` folds on its own account, which
`tentative` records, and `taintedBy` records that `app.ts` is what killed it.

## Round-trip fixtures

The third kind has no source at all. The directory holds `value.json`, a
namespace as data with envelopes written as `F-Val-Domain` writes them, and an
`expect.json` with `"roundtrip": true`. The implementation's generator writes
the source, the fold of that source must equal the input, and that is
`F-Val-Source`'s round trip made executable. It is judged in `data-host`
unless told otherwise, since in `full` the fold of a resource's form is a
live instance. An adapter with no generator skips it, and the skip is
reported.

## How they are run

`runFixtures(adapter, fixtures)` is the entry point, dispatching to
`runFixture` for one export and to `runProjectFixture` for a build. The project
path reports a skip when the adapter has no whole-build entry or returns
`"unavailable"`.

`compareAdapters(a, b, fixtures)` is a separate pass, and it does not read the
expectation at all. It asks two implementations the same questions and reports
where they differ. On project fixtures it compares the final verdict, the
tentative verdict and the taint source, for the reason above.

The set holds {{< figure "fixtures" >}} fixtures, of which
{{< figure "wholeBuildFixtures" >}} are whole-build, read from the tree at
build time.
