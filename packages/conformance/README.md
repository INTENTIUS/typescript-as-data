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

## The checker oracle (#233)

`src/oracle.ts` checks each folded plain-data export against the type `tsc`
gives it, with nothing executed, so it covers `data-host`, where there is no
run path. In outline:

- The build is copied and every top-level `const` initializer and
  `export default` expression that is data is wrapped in
  `declare function __tsad_exact<const T>(v: T): T`. The `const` type
  parameter makes the checker infer literal types, as `as const` would.
- The folded value is written as a literal type, and that type and the
  export's type must be assignable to each other, which for literal types is
  equality.
- Every node of the folded value is probed for whether the checker has a
  single literal there. Where it does not (`string`, `number`, `boolean`, a
  union, `any`, an array type, an index signature, a class instance), the
  leaves below are reported unchecked with their path, never passed, and the
  summary gives the share of leaves checked.
- All of it is decided from diagnostics of public `tsc` on emitted files, one
  run per batch, never the checker API, so it runs the same under TypeScript
  7's native compiler (`TSAD_ORACLE_TSC=tsgo`).

```ts
import { runOracle, summarizeOracle, fixtureSubjects } from "./oracle";

const results = runOracle(await fixtureSubjects(referenceDataHostAdapter, fixtures));
const { pass, unchecked, failUnexpected, checkedLeaves, leaves } = summarizeOracle(results);
```

An export that constructs with `new`, or whose fold holds a live value or an
envelope, is out of scope rather than failed. A lying assertion
(`"es5" as unknown as "esnext"`) fails by design, and a fixture that uses one
goes in `EXPECTED_FAILURES` (empty today). `src/oracle.test.ts` runs it over `spec/fixtures/`, and
`addOracleColumn` in `src/corpus.ts` adds it to the corpus report as a third
column. The method is written up on the site, under Conformance, as "The
checker oracle".

## What is not in the package

The chant adapter, the corpus cross-check and the checker oracle
(`src/adapters/`, `src/corpus.ts`, `src/oracle.ts`) are excluded from the
build: they import chant, the reference or `typescript`, and they are the
repository's own cross-checks rather than the harness.
