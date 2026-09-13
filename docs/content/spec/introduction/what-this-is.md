---
title: "What this is"
description: "The scope of the specification, its relationship to chant, and what the name does not claim."
weight: 1
aliases: ["/introduction/what-this-is/"]
---

This project is a specification for a statically evaluable subset of
TypeScript, with a reference implementation and a conformance suite.

The subset is the part of TypeScript whose value is fixed by its source:
literals, constants, and symbolic references. Most configuration languages get that property by
inventing a language. This specification carves a fragment out of an existing
one and defines the edge, where source outside the subset falls back to real
execution and the two paths must agree.

That equivalence is the objective every judgment serves, and `spec/judgments.md`
states it: at a fixed build-parameter binding, folding a file and running it
are observationally equivalent. A source file may be reduced from its AST to
the entities it declares, or imported and executed, and the build cannot tell
which happened from the output.

The binding is part of the statement. `params.<name>`
folds to a literal supplied at build invocation, so output is a function of
source and of binding.

## The three pieces

The specification lives in `spec/` and is normative. Every rule in it carries
an identifier from one vocabulary, `S-*` for shape rules and `F-*` for fold
rules, and `spec/inventory.md` is a ledger of decision points that cites those
rules.

Two CI gates check both sides:

- `spec/coverage.test.ts`, that every inventory row cites a rule that is
  actually defined.
- `spec/fixtures.test.ts`, that every defined rule is either exercised by a
  fixture or listed in `spec/fixtures/UNCOVERED.md` with a reason.

The reference implementation is `packages/reference`
(`@intentius/tsad-reference`). Written from the specification text, it does not
cover everything the specification defines. See
[the reference implementation](/typescript-as-data/spec/reference/overview/) for
what it does cover and
[what it does not do](/typescript-as-data/spec/reference/limits/).

The conformance suite is `packages/conformance`. That package holds a narrow
adapter interface and the fixture format, plus the runner and an adapter for
chant. The fixtures themselves live under `spec/fixtures/`, one directory per
rule, so they sit next to the text they exercise.

## The relationship to chant

[chant](https://github.com/INTENTIUS/chant) is a production implementation of
this subset, and it is where the subset came from. Being a production
implementation does not make it the reference one. The conformance suite tests
chant, and chant's example corpus is what the suite measures against.

Ownership was decided on 2026-09-10 and `spec/README.md` records it: this
repository is normative and chant implements it. chant's
`packages/core/src/fold/subset.ts`, which calls itself the single canonical
definition of chant's statically-foldable expression subset, is an
implementation of this specification.

A subset change therefore goes spec-first:

1. The rule is proposed and landed here with its grammar, judgment or
   value-domain text.
2. It carries an identifier and a fixture.
3. chant implements it citing that identifier, and releases it.

There is a provisional path for a change chant needs before the rule can be
written properly. chant may ship it with the affected rule marked provisional
in `subset.ts`'s module doc, naming the issue here that will specify it. A
provisional marker may survive at most one chant release.

`spec/README.md` states what this costs chant, so that it is accepted rather
than discovered: the subset can no longer change by editing code and a
comment.

## What the name claims, and what it does not

"typescript-as-data" names a general idea. What is specified is one statically
evaluable subset of TypeScript, the one chant's fold mechanism implements,
together with what happens at its edge. It is not a claim that this is the way
to read TypeScript as data.

The specification is fixed to TypeScript in three ways. The syntax is the
TypeScript AST as the `typescript` compiler package parses it. The module
system is ES modules. The semantics of every admitted operator are
ECMAScript's, which a second implementation in another language must reproduce
rather than inherit from its own host.

What varies is the host. `F-Host-Interface` in `hosts.md` lists the seven
things a host supplies, with the rule admitting each. They start with the
classes whose instances are entities and end with the host's rules contract;
the registry and the trust set sit between.

The generality this buys covers host vocabularies. It does not cover
languages. `spec/README.md` is explicit that "parameterized by a host" reaches
host vocabularies and stops there.

Another language would reuse the value-domain shape and the per-file decision
and identity-taint fixpoint; the two-layer admissibility structure; the three
evaluation modes and the conformance obligations. It would have to reproduce the
AST classification, TypeScript's node kinds, and ECMAScript coercion.

## How disagreements are settled

Two process rules from `spec/README.md` govern what happens when two
implementations differ.

A disagreement between two implementations is triaged in the specification
first. It is reclassified as an implementation bug only once the specification
is shown to be unambiguous on the point.

The order is the rule because the incentives run against it: amending an
implementation takes an afternoon and amending a specification takes a
decision, so the cheap label is the one most likely to be wrong. A disagreement
that survives triage is recorded with the issue that will settle it, and the
record may only shrink.

A difference that a missing capability explains is not a disagreement. Where
one implementation has no answer to give, for want of a host or of a form it
does not implement, the difference is counted under a named limit and reported
apart from the agreement figure.

The [corpus cross-check](/typescript-as-data/spec/conformance/corpus/) is where
this rule is applied. `packages/conformance/src/corpus.ts` names two such
limits, `host` and `invocation`, and counts each of them separately.
