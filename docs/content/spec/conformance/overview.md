---
title: "Conformance"
description: "The adapter interface, the runner, and the four things the suite checks."
weight: 1
aliases: ["/conformance/overview/"]
---

`packages/conformance` holds the adapter interface and the fixture format, plus
the runner and the chant adapter. The fixtures themselves are not in the
package: they live under `spec/fixtures/`, one directory per rule, next to the
text they exercise.

## The adapter

An implementation under test provides a `ConformanceAdapter`. The interface is
deliberately narrow, so a foreign implementation, chant or one in another
language behind a shim, can satisfy it without exposing internals. Source in,
verdict out.

```ts
interface ConformanceAdapter {
  readonly name: string;
  readonly specVersion: string;
  shape(source: string, exportName: string): ShapeResult;
  foldExport(source: string, exportName: string): FoldResult;
  foldProject?(
    files: Map<string, string>,
    host?: ConformanceHost,
    mode?: IsolationMode,
  ): ProjectResult | "unavailable" | Promise<ProjectResult | "unavailable">;
  rules?(files: Map<string, string>, host: ConformanceHost, phase: RulePhase): Finding[] | "unavailable";
  generate?(namespace: Record<string, unknown>, host?: ConformanceHost): string | "unavailable";
}
```

`shape` gives the `S-*` verdict on the initializer of one export, and returns
`"unavailable"` if the implementation exposes no shape classifier at all.
`foldExport` gives the `F-*` verdict, either a JSON-comparable value or a
located rejection. `foldProject` answers J2 and J3 over a whole build in the
mode the fixture asks for, and is optional, because not every implementation
has a whole-build entry point. `rules` runs the host's semantic rules over a
build and returns findings as data, and `generate` writes source for a
namespace, which the round trip needs. Whenever a hook cannot answer it returns
`"unavailable"`, and the fixture is reported skipped rather than silently
passing.

`ShapeResult` and `FoldResult` carry a `rule` field alongside the location.
That is `F-Reason`'s requirement, that the rule identifier and the location are
normative while the message wording is not.

## What the suite checks

Five checks, in four places.

**The reference passes every fixture**, which
`packages/conformance/src/runner.test.ts` checks against `referenceAdapter`.
It also asserts that the only project fixture skipped is the one judged under
`executing`, a mode this package reports unavailable by name. Two stub adapters must
fail, one returning `run` for every file and one folding everything to `null`.
An implementation that falls back on every file in a build is sound and
useless, and without the stub, `F-Taint`'s "least set" would be untested.

**chant passes every fixture, and agrees with the reference on every one**,
through chant's public API in
`packages/conformance/src/chant-agreement.test.ts`, pinned to a release. More
is in
[the chant cross-check](/typescript-as-data/spec/conformance/chant-cross-check/).

**Every rule is covered or deliberately listed as uncovered**, gated by
`spec/fixtures.test.ts` with `spec/fixtures/UNCOVERED.md` as the allowlist.
[Coverage](/typescript-as-data/spec/conformance/coverage/) has the detail.

**The Rust evaluator passes every fixture tagged for the data-host profile
and agrees with the reference on each**, in
`packages/conformance/src/rust-agreement.test.ts`, with the binary built in
its own CI job.

**The two implementations agree on a corpus nobody wrote for the purpose**,
measured by `packages/conformance/src/corpus.test.ts` over chant's example
corpus and over a codebase nobody here maintains, described in
[the corpus cross-check](/typescript-as-data/spec/conformance/corpus/).

The first four run in `npm test` and `.github/workflows/ci.yml` on every pull
request. The fifth has its own command and its own weekly workflow, because it
needs a chant checkout with its lexicon artifacts generated.

## Named hosts

`F-Host-Interface` item 1 requires real classes that revival can construct,
while a fixture is only data (`.ts` sources and a JSON expectation). So the
classes live in code, in `packages/conformance/src/host.ts`, and a fixture
names the host it wants by its `host` key.

Nothing in that file imports an implementation. An adapter translates a
`ConformanceHost` into whatever its own host interface is, which is what keeps
the fixture set neutral between implementations.

## What agreement here is worth

`paper/measurements.md` is explicit about the ceiling on this. The fixtures
were written to exercise particular rules, so agreement on them is agreement on
cases somebody chose. It also records that agreement used to be guaranteed
rather than observed: until issue #50 the reference implementation's evaluation
layer was a port of chant's.

The port's own failure mode is recorded in the same file, because it is the one
this should not paper over. `chant-v0.69.0` extended an envelope check from
three kinds to five while the port still had three, and because no fixture
covered the shape, the suite stayed green against a stale port until the drift
was found by reading the release diff. Two fixtures now cover it.
