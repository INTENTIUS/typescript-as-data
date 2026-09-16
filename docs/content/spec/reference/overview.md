---
title: "Reference implementation"
description: "What @intentius/tsad-reference covers, where it came from, and how to run it."
weight: 1
aliases: ["/reference/overview/"]
---

`packages/reference` is `@intentius/tsad-reference`, a reference
implementation of the specification in `spec/`. It is a workspace package in
this repository, published to npm at the specification's version.

It is deliberately partial.
[What it does not do](/typescript-as-data/spec/reference/limits/) says where,
summarizing `packages/reference/CAVEATS.md`. The conformance numbers have to
be read with that partiality in mind.

## What it covers

The core of it is the expression layer: the `S-*` productions of
`spec/grammar.md` §2 and the `F-Eval-*` rules of `spec/evaluation.md`, J1, over
the value domain of `spec/values.md`. `packages/reference/README.md` lists
shape classification and expression evaluation, then the value domain's
envelope shapes. The host interface, `F-Host-Interface`, is taken whole from
a `ConformanceHost`, so the reference folds against whatever host a fixture
names rather than a host of its own.

Since then the module and build layers have been written too.
`packages/reference/src/project.ts` implements J2 (the per-file verdict) and J3
(the identity-taint fixpoint) from `spec/taint.md` rather than from any
implementation. A project there is a map of path to source, with no filesystem
and no real module system, which is enough for both judgments because each is
defined over a finite set of files and the edges between them.

That is what makes the whole-build fixtures possible. A taint edge does not
exist inside a single file, so J3 could not be tested at all until an
implementation could be handed a set of files.

The source layout is small enough to read:

| File | Holds |
|---|---|
| `subset.ts` | the shape classifier, `S-*` |
| `fold.ts` | expression evaluation, `F-Eval-*` |
| `fnbody.ts` | the project-local function body rules |
| `host.ts` | the host interface and `EMPTY_HOST` |
| `foldable-helpers.ts` | the helper allowlist and owned-specifier tests |
| `module.ts`, `project.ts` | J2 and J3 |
| `revive.ts` | revival of envelopes, `F-Val-Fate` |
| `rules.ts` | the rules contract, `F-Rule-*`, with two shape rules |
| `generate.ts` | the smallest generator, `F-Val-Source` |
| `adapter.ts` | the conformance adapters, `referenceAdapter` and `referenceDataHostAdapter`, one per profile |

## Where it came from

The reference was written from the grammar and the judgments without
consulting chant's source, by an author who had read chant closely while
writing the specification from it. Writing it found three places where the
text was not complete enough:

- `grammar.md` used an *unclaimed* callee in four normative sentences and
  defined it in none.
- `F-Import` and `F-Val-Live` stated two identity predicates, and nothing said
  they answer different questions.
- `F-Eval-Ident` step 1 read an instance as "J2 pre-built" that no rule of J2
  built.

`S-Unclaimed`, `F-Identity` and `F-Prebuild` are the rules that resulted.

## Running it

Node 24 and npm are the prerequisites, and these run from the repository root.

```bash
npm install
npm run typecheck
npm test
```

`npm run typecheck` is `tsc -p tsconfig.json` over the whole repository.
`npm test` is `vitest run --passWithNoTests`, which covers more than this
package. It runs the reference's own tests and the conformance runner against
the reference, plus the chant cross-check and the two `spec/` gates.

To run only the reference's own tests, point vitest at the directory:

```bash
npx vitest run packages/reference
```

The [corpus cross-check](/typescript-as-data/spec/conformance/corpus/) is not part
of `npm test`. It needs a chant checkout and has its own command.
