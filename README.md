# typescript-as-data

A specification for a statically evaluable subset of TypeScript. It comes with a reference implementation and a conformance suite.

The subset is the part of TypeScript whose value is fixed by its source: literals, constants, and symbolic references. A tool can reduce it to data without running it. Most configuration languages get this property by inventing a language. This specification carves a fragment out of an existing one and defines the edge: source outside the subset falls back to real execution, and the two paths must agree.

## Status

Every part of the mechanism has a normative draft under `spec/`. One identifier vocabulary covers them (`S-*` for shape rules, `F-*` for fold rules). A decision-point inventory of 110 rows cites those rules and is gated in CI. A reference implementation covers the walking-skeleton subset. chant is cross-checked against it from the published package. Fixture coverage is one rule deep; `spec/fixtures/UNCOVERED.md` lists the rest and may only shrink.

## Layout

| Path | Holds |
|---|---|
| `spec/` | The normative specification |
| `spec/fixtures/` | Conformance fixtures, one directory per rule |
| `packages/reference` | The reference implementation (`@intentius/tsad-reference`) |
| `packages/conformance` | The adapter interface, fixture format, runner, and the chant adapter |
| `docs/` | The published site (Astro + Starlight), generated from `spec/` |

## Relationship to chant

[chant](https://github.com/INTENTIUS/chant) is a production implementation of this subset and its origin. It is not the reference implementation; the conformance suite tests it, and its example corpus is what the suite measures against.

## Development

Node 24 and npm.

```bash
npm install
npm run typecheck
npm test
npm run lint:prose

npm run docs        # docs dev server
npm run docs:build  # static build, as CI runs it
```

## License

Apache-2.0
