# typescript-as-data

A specification for a statically evaluable subset of TypeScript, a minimal
reference implementation of it, and a conformance suite both the reference
implementation and independent implementations run against.

The subset is the part of TypeScript whose value is fully determined by
literals, constants, and symbolic references — the part a tool can reduce to
data without executing it. Configuration languages usually get this property by
inventing a language. This specification gets it by carving a fragment out of an
existing one, and by defining what happens at the edge: source outside the
subset is not an error, it falls back to real execution, and the specification
says what must hold across that boundary for the two paths to agree.

## Status

Skeleton. Nothing here is normative yet. Work is tracked in
[issues](https://github.com/INTENTIUS/typescript-as-data/issues); the epics
describe the intended shape.

## Layout

| Path | What it holds |
|---|---|
| `spec/` | The normative specification: grammar, judgments, rule identifiers |
| `packages/` | The reference implementation and the conformance harness |
| `docs/` | The published site (Astro + Starlight) |

## Relationship to chant

[chant](https://github.com/INTENTIUS/chant) is a production implementation of
this subset and the origin of it. It is not the reference implementation: it is
one of the implementations the conformance suite tests, and the source of the
corpus the suite measures against.

## Development

```bash
npm install
npm run typecheck
npm test

npm run docs        # docs dev server
npm run docs:build  # static build, as CI runs it
```

## License

Apache-2.0
