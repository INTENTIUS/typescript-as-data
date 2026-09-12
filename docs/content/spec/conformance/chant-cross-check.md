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
entry only: `fold`, `collectConsts`, `FoldError`, and, since `chant-v0.64.0`,
`findSubsetViolation` for the shape half. No source is vendored and no internal
is reached for. What the suite tests is the version a user would install. With
an older pin, the adapter would report shape `"unavailable"` rather than
guessing.

## What it asserts

**The pinned implementation passes every fixture through its public fold
API.** The same `runFixtures` pass the reference goes through, with the chant
adapter.

**It agrees with the reference on every fixture.** This is `compareAdapters`,
which ignores what the fixture expects and asks whether the two implementations
answer the same. A fixture could be wrong about both of them and this test
would still have something to say.

**Nothing whole-build is skipped.** Since `chant-v0.72.0` the adapter
hands chant the fixture's host as a package outside the lexicon convention
(chant#2438). One naming a host therefore reaches chant like any other.
The test asserts that no project fixture was skipped. The three fixtures chant
holds out under chant#2441 are held out by name, so a new fixture citing the
same rule is compared rather than excused. The four round-trip fixtures skip,
chant having no generator yet.

**On whole-build fixtures the two still agree.** `compareAdapters` again,
restricted to project fixtures. On those it compares the final verdict, the
tentative verdict and the taint source. A seed and a taint casualty both
produce `run`, so the verdict alone cannot tell them apart.

**The shape classifier is available and agrees on every fixture.** The pinned
release carries the export, so `"unavailable"` there would be a regression. It
is asserted rather than assumed.

## What it establishes

`paper/measurements.md` records the result at the pin.

| Pin | Fixtures | Rules with a fixture | Shape and fold agreement |
|---|---|---|---|
| chant <code>{{< figure "chantPin" >}}</code> | {{< figure "fixtures" >}}, of which {{< figure "wholeBuildFixtures" >}} are whole-build | {{< figure "rulesWithFixture" >}} of {{< figure "rulesTotal" >}} | all, on every fixture the pin can answer |

The counts are read from the fixture tree at build time; the agreement figure
is `paper/measurements.md`'s.

The same file reports one disagreement that existed between the two, on an
envelope inside a template span. It was triaged the way `spec/README.md`
requires, in the specification first: the spec recorded the recommendation,
`chant-v0.68.0` implemented it, and a fixture now pins it.

On the whole-build side, `paper/measurements.md` notes that until
`chant-v0.70.1` there was no entry that took a set of files, so none of the J3
fixtures were answerable there. chant#2408 added one, and chant#2438 let the
fixtures that name a host follow. The two agree on every file's final verdict
and its tentative verdict; for every taint casualty they agree on the file the
edge came from and on which rule it was.

Two agreements there are worth naming, and `paper/measurements.md` names them.
The pinned implementation classifies the capturing sibling as reached by a
capture rather than an import, which is the distinction chant#2406 was filed
for. And a file whose only tie to another is a call returning computed plain
data folds in both, which is `F-Identity`'s entity test holding in an
implementation that has never read it.

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
