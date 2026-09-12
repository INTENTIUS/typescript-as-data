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

## What is not in the package

The chant adapter and the corpus cross-check (`src/adapters/`, `src/corpus.ts`)
are excluded from the build: they import chant and the reference, and they
are the repository's own cross-checks rather than the harness.
