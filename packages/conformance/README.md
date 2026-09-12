# @intentius/tsad-conformance

The conformance suite of the typescript-as-data specification, as a package.
It carries the fixtures under `spec/fixtures/` at the version it declares,
the loader and runner that judge an implementation against them, and the
named hosts a whole-build fixture may ask for. It carries no implementation:
the reference implementation is `@intentius/tsad-reference`, a separate
package, so an implementation under test does not have to install a
competing one to get the harness.

## Running the suite against an implementation

Supply a `ConformanceAdapter` (`src/adapter.ts`): a name, the specification
version the implementation declares, a shape classifier, an expression
folder, and optionally a whole-build entry. Then:

```ts
import { loadFixtures, runFixtures, bundledFixturesDir } from "@intentius/tsad-conformance";

const fixtures = loadFixtures(bundledFixturesDir());
const reports = await runFixtures(myAdapter, fixtures);
for (const r of reports) if (!r.pass) console.log(r.fixture, r.failures);
```

`compareAdapters(a, b, fixtures)` reports where two implementations disagree
with each other, independently of what the fixtures expect. The repository's
own use of it is in `src/chant-agreement.test.ts`.

## Versions

The package's major and minor are the specification version it carries
(`spec/VERSION`); the patch is the package's own. A `1.0.x` package holds the
fixtures of specification 1.0. An adapter's `specVersion` is compared against
the fixtures' version by whoever runs the suite, never assumed.

## Gating a document's citations (#34)

An implementation's documentation cites rule identifiers, and a subset change
here can leave that prose describing the old subset. `loadRules(bundledSpecDir())`
indexes every `S-*` and `F-*` with its text at the version the package
carries, and `checkCitations(document, index, declaredVersion)` reports an
identifier that is not a rule, a quote that is not the rule's text, and a
declared version that is not the index's. A document quotes a rule with a
marker line and a blockquote:

```
{/* rule: F-Depth */}
> Each terminates a different recursion and each turns exhaustion into a fallback.
```

A bare mention is held only to existing; a quote is held to being verbatim.
The repository runs this over chant's own docs in the corpus workflow, and
chant can run the same call in its CI against the published package.

## What is not in the package

The chant adapter and the corpus cross-check (`src/adapters/`, `src/corpus.ts`)
are excluded from the build: they import chant and the reference, and they
are the repository's own cross-checks rather than the harness.
