---
title: "Rules and judgments"
description: "The S-* and F-* identifier families, and the four judgments J1 to J4."
weight: 2
aliases: ["/introduction/rules-and-judgments/"]
---

Every normative rule in `spec/` carries an identifier, and the identifier says
something about the rule. There are two families and four judgments. Reading
either name correctly tells you what kind of information the rule is allowed to
use.

## The two rule families

`spec/README.md` defines the split, and the family is part of the meaning.

An **`S-*` rule is a shape rule**, decidable from syntax alone by a classifier
with no binding resolver and no registry. All of them live in
`spec/grammar.md`. Productions there are written in the usual notation, for
example:

```
S-ExportResource    ::= export const ⟨Identifier⟩ = new ⟨Expr⟩ ( ⟨Args⟩ )
S-ExportSingle      ::= export const ⟨Identifier⟩ = ⟨Expr⟩
S-ExportDestructure ::= export const { ⟨PlainElement⟩+ } = ⟨Expr⟩
```

An **`F-*` rule is a fold rule**, which syntax alone cannot decide. Deciding
it needs name resolution, a host registry, or the module graph. Its sub-prefix
names the file that owns it.

| Prefix | Owner |
|---|---|
| `F-Eval-` | `judgments.md` J1 |
| bare `F-` | `judgments.md` J2 and J3 |
| `F-Obs-`, `F-NoOwnExecution`, `F-Depth` | `judgments.md` J4 |
| `F-Val-` | `values.md` |
| `F-Div-`, `F-Exc-`, `F-Direction` | `divergence.md` |
| `F-Host-` | `hosts.md` |

The two families are allowed to disagree in exactly one direction. The `S-`
side may accept what the `F-` side later rejects, and never the reverse. That
claim is `F-Direction` in `spec/divergence.md`, where it is stated as a
proposition with a proof obligation, and the two tolerated exceptions are
`F-Exc-Lazy` and `F-Exc-Registry`.

Names are `Prefix-CamelWords` with no digits in the name part, and are meant to
be specific enough to read alone: `F-Eval-Member`, not `F-Eval-3`. Numbered steps are cited as in
`F-Eval-Member step 4`, and the step number is not part of the identifier.

An identifier names one rule for the life of the specification. When a rule is
split, its identifier stays on the part closest to its original meaning and the
new part gets a new one. One that is removed or renamed is struck through in
place, with a note naming its successor. The identifier is never reused.

Two tests hold the vocabulary together. `spec/coverage.test.ts` asserts that
every row of `spec/inventory.md` cites a rule that some spec file actually
defines. `spec/fixtures.test.ts` asserts the reverse, that every defined rule is
exercised by a fixture or listed in `spec/fixtures/UNCOVERED.md`. Together they
make an identifier that nothing exercises, and a citation of nothing, a CI
failure rather than a drift.

## The four judgments

`spec/judgments.md` carries all four, layered. J1 evaluates one expression and
J2 decides one file; J3 decides a whole build; J4 states the properties that
are about the mechanism rather than about any one of the others.

### J1, expression evaluation

Written `Γ, H ⊢ e ⇓ v`. The environment `Γ` is `(consts, externals, depth)`,
where `depth` is the number of project-local function bodies being folded
around `e` and is 0 at a file's top level. `H` is the host `(ρ, helpers)`, which is the
intrinsic registry and the authoring-helper allowlist, both defined in
`spec/hosts.md`. The result `v` ranges over the value domain of
`spec/values.md`. Every rule that fails does so with a located rejection.

The rules here are keyed to the grammar's productions, so `S-Template` in
`grammar.md` has `F-Eval-Template` in `judgments.md`, and a fixture normally
cites both.

### J2, the per-file verdict

Written `B, ι ⊢ f ⇓ fold(X, L) | run(reason)`. `ι ∈ {open, isolated}` is the
isolation mode. On `fold`, `X` is the complete export namespace and `L` is the
subset of the build's files whose objects `f` captured. Every `run(reason)`
carries a located reason.

The verdict is evaluated per file, without regard to other files' verdicts
except through `F-Import`. It is *tentative*, and J3 is what makes it final.

### J3, the identity-taint fixpoint

This is the judgment with no obvious precedent, and `spec/judgments.md` says
why it has to exist. Per-file partial evaluation is unsound in the presence of
object identity unless something makes it sound. If file `A` folds and file `B`
runs, and both refer to an entity that `A` produced, then `B`'s real import of
`A` constructs a second copy of it. The build then holds two objects for one
entity.

Comparable systems avoid the problem by not having it. Compile-time function
execution copies values across the boundary, per-page static rendering shares
no runtime objects across it, and a whole-program partial evaluator has one
heap. chant keeps per-file granularity and shared identity at the same time,
and `spec/judgments.md` calls this judgment the price of that.

A build is `B = (F, →, P)`. That is the finite set of discovered project
files, the import and re-export edges between them, and the build-parameter
binding.
Bare specifiers are not edges, because a package is never a member of `F`.
J3 takes J2's tentative verdicts as its seed and computes `T(B)`, the least
set containing that seed and closed under two kinds of edge. `F-Seed` is every
file whose tentative verdict was `run`, and nothing else ever enters the seed.
`F-Succ` propagates taint from a tainted file `f` in two directions at once:
*forward along imports*, to every `g` that `f` imports, because `f`'s real
import of `g` would construct a second copy of `g`'s entities; and *backward
along captures*, to every `c` that captured `f`'s objects, because the instance
`c` captured while folding is no longer the instance the build collects.
`F-Verdict` then says a file folds if and only if it is not in `T(B)`, and
`F-Fix` states `T(B)` as the least fixpoint of a monotone operator on a finite
lattice, so an implementation is free to compute it by any means rather than by
the worklist the wording suggests.

`F-Identity` is the rule that keeps the two identity predicates in this
specification apart. The *entity test* recurses through plain objects and
arrays; the *reference test* is `typeof` object or function, does not recurse,
and admits a plain `{ a: 1 }` that the entity test rejects. The entity test is
the normative one for the proposition J3 is about. `F-Import` uses the
reference test anyway, as a deliberate over-approximation whose cost is
coverage rather than correctness.

### J4, properties and observables

Rules about the whole mechanism.

`F-NoOwnExecution` says that for every file with final verdict `fold`, none of
its top-level statements is executed by the build. What still executes is
bounded and named, and all of it is code the file imported rather than code the
file wrote.

`F-Depth` requires an implementation to bound three recursions and lets it
choose the values, which must be stated. Exhaustion must produce `run`, never a
failure and never a silent change of evaluation mode.

`F-Obs-Counters`, `F-Obs-Report`, `F-Obs-Provenance` and `F-Obs-Messages` are
the observability rules. A conforming implementation reports, per file, the
final verdict and, for `run`, a located reason. Message stability is explicitly
not normative; location and rule identifier are. Path provenance is an optional
capability that conformance reports rather than asserts, because the run path
does not uniformly produce it.
