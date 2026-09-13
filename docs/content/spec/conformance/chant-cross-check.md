---
title: "The chant cross-check"
description: "Running the fixtures against chant through its public fold API, pinned to a release."
weight: 4
aliases: ["/conformance/chant-cross-check/"]
---

`packages/conformance/src/chant-agreement.test.ts` runs the fixture set against
chant, and then runs both implementations against each other.

The pin is a real dependency. `@intentius/chant` is in this repository's
`devDependencies` at version <code>{{< figure "chantPin" >}}</code>, and the adapter in
`packages/conformance/src/adapters/chant.ts` reaches it through its public
entry only: `fold`, `foldProject`, `collectConsts`, `FoldError`, and, since
`chant-v0.64.0`, `findSubsetViolation` for the shape half. What the suite tests is the version a user would install. With
an older pin, the adapter would report shape `"unavailable"`.

## What it asserts

Five things. Three go through `compareAdapters`, which ignores what a fixture
expects and asks only whether the two implementations answer the same.

- The pin passes every fixture through its public fold API, the same
  `runFixtures` pass the reference goes through.
- It agrees with the reference on every one. A fixture could be wrong about
  both and this check would still have something to say.
- Nothing whole-build is skipped. The adapter hands chant the fixture's host as
  a package outside the lexicon convention, so a fixture naming a host reaches
  it like any other. A fixture chant cannot answer yet is held out by name
  against the issue that says why, and a guard asserts the reason still stands.
  The four round-trip fixtures skip, chant having no generator.
- On whole-build fixtures the two still agree. A seed and a taint casualty both
  produce `run`, so the comparison reaches past the final verdict to the
  verdict before taint and to the taint source.
- The shape classifier is available and agrees. The pinned release carries the
  export, so `"unavailable"` would be a regression, and it is asserted rather
  than assumed.

## What it establishes

`paper/measurements.md` records the result at the pin.

| Pin | Fixtures | Rules with a fixture | Shape and fold agreement |
|---|---|---|---|
| chant <code>{{< figure "chantPin" >}}</code> | {{< figure "fixtures" >}}, of which {{< figure "wholeBuildFixtures" >}} are whole-build | {{< figure "rulesWithFixture" >}} of {{< figure "rulesTotal" >}} | all, on every fixture the pin can answer |

The counts are read from the fixture tree at build time; the agreement figure
is `paper/measurements.md`'s.

Every whole-build fixture is answered at the pin, and the two agree on each
file's final verdict and its verdict before taint; for every taint casualty
they agree on the file the edge came from and on which rule it was.

## Running it

This cross-check is part of the ordinary test run:

```bash
npm install
npm test
```

To run only this file:

```bash
npx vitest run packages/conformance/src/chant-agreement.test.ts
```

Nothing external is needed. The corpus cross-check is the one that needs a
chant checkout.
