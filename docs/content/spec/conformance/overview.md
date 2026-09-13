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
language behind a shim, can satisfy it without exposing internals. It takes
source and returns a verdict.

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

What each hook answers:

- `shape`, the `S-*` verdict on the initializer of one export.
- `foldExport`, the `F-*` verdict: a JSON-comparable value, or a located
  rejection.
- `foldProject`, J2 and J3 over a whole build, in the mode the fixture asks
  for. Optional, because not every implementation has a whole-build entry
  point.
- `rules`, the host's semantic rules over a build, as findings.
- `generate`, source for a namespace, which the round trip needs.

A hook that cannot answer returns `"unavailable"`, and the fixture is reported
reported skipped rather than counted as a pass. A shape classifier the implementation
does not expose at all is the common case.

`ShapeResult` and `FoldResult` carry a `rule` field alongside the location.
That is `F-Reason`'s requirement, that the rule identifier and the location are
normative while the message wording is not.

## What the suite checks

Five checks, in four places.

1. The reference passes every fixture, which
   `packages/conformance/src/runner.test.ts` checks against
   `referenceAdapter`. It also asserts that the only project fixture skipped
   is the one judged under `executing`, a mode this package reports
   unavailable by name.
2. chant passes every fixture, and agrees with the reference on every one,
   through chant's public API in
   `packages/conformance/src/chant-agreement.test.ts`, pinned to a release.
   More is in
   [the chant cross-check](/typescript-as-data/spec/conformance/chant-cross-check/).
3. Every rule is covered or deliberately listed as uncovered, gated by
   `spec/fixtures.test.ts` with `spec/fixtures/UNCOVERED.md` as the allowlist.
   [Coverage](/typescript-as-data/spec/conformance/coverage/) has the detail.
4. The Rust evaluator passes every fixture tagged for the data-host profile
   and agrees with the reference on each, in
   `packages/conformance/src/rust-agreement.test.ts`, with the binary built in
   its own CI job.
5. The two implementations agree on a corpus nobody wrote for the purpose,
   measured by `packages/conformance/src/corpus.test.ts` over chant's example
   corpus and over a codebase nobody here maintains, described in
   [the corpus cross-check](/typescript-as-data/spec/conformance/corpus/).

Two stub adapters must also fail: one returns `run` for every file, one folds
everything to `null`. An implementation that falls back on every file in a
build is sound, so without the stub `F-Taint`'s "least set" would be untested.

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

The fixtures were written to exercise particular rules, so agreement on them is
agreement on cases somebody chose. `paper/measurements.md` states that ceiling
and the history behind it.
