# Divergence between the shape classifier and the folder

Normative draft (#17). One subset, two consumers with unequal information
(R3). This file states the direction in which they may disagree as a claim
with a proof obligation, enumerates every known divergence, and states the
two exceptions with the reason each is tolerated. Derived from
`subset.ts`'s module doc and `findSubsetViolation`, and `fold()`, at
`e4074c17` with the chant-v0.63.0 addition.

---

## F-Direction — the claim

Let `shape(e, ρ)` be the classifier's verdict on expression `e` given an
optional registry `ρ`, and `fold(e, Γ, ρ)` the folder's, given also an
environment `Γ`.

> **Proposition.** For every `e`, `Γ`, `ρ`: if `fold(e, Γ, ρ)` succeeds, then
> `shape(e, ρ)` accepts — *except* in the two cases F-Exc-Lazy and
> F-Exc-Registry below.

Equivalently: the classifier may accept what the folder rejects (a *false
negative* relative to fold, visible only as a later fallback), and must never
reject what the folder accepts (a *false positive*, visible as a lint error on
folding code) — outside the two named exceptions.

**Why this direction.** A false negative costs a fallback the author learns
about from `[fold:run]`. A false positive costs a lint error on correct
source, and a lint that cries wolf gets disabled. The classifier is also the
predicate a downstream tool asks "will this fold?" — a tool with no registry
must get an answer that is safe to act on, which means erring toward "it may
run" (`subset.ts` module doc, point 2c).

**Discharge.** By construction: both consumers import one classifier
(`subset.ts`), so they cannot disagree on node kinds, operators or key shapes;
every remaining disagreement is a *resolution* the classifier does not
perform, enumerated below. And by fixture: one accepting and one rejecting
fixture per row of F-Div, asserting the classifier's and the folder's verdicts
side by side (#8, #24). chant's `subset-doc-parity.test.ts` is the precedent.

## F-Div — the divergences in the permitted direction

Shape accepts; the folder may reject, because it resolves.

| Rule | Shape sees | Folder additionally requires | Row |
|---|---|---|---|
| F-Div-Ident | any bare identifier is valid | resolves in `consts` then `externals`; `process` is a pointed rejection | L2.3, L3.6, L3.7 |
| F-Div-Tag | any tagged-template tag; interior opaque | tag is a registered, tag-foldable intrinsic; interior folds | L2.4 |
| F-Div-Provenance | a registered helper *name* | the name is bound by an import from chant, not shadowed | L2.11 |
| F-Div-SpreadType | a spread operand of valid shape | operand folds to an object (object spread) or array (array spread) | L3.4, L3.5 |
| F-Div-SameFileNew | a bare identifier | if bound to a same-file `new`, only `externals` may answer; else rejected to avoid a duplicate construction | L3.8 |
| F-Div-Nullish | `a.b`, `a[k]` | the object does not fold to `null`/`undefined`; `?.` short-circuits instead (chant-v0.63.0) | L3.10, L3.21 |
| F-Div-NsNew | `new ⟨Expr⟩(…)` with any callee | the callee is a plain identifier | L3.15 |
| F-Div-Method | `x.m(…)` | the receiver folds to a real value that is not an envelope and whose `m` is a function | L3.18, L3.19 |
| F-Div-Step | `⟨call⟩.step` | the callee is an *unclaimed* bare identifier | L3.20 |
| F-Div-Depth | a `new`, tagged template, helper call, intrinsic call, or `.step` | is not inside a folded function body | L3.16 |
| F-Div-Eager | a registered eager intrinsic name | resolves to a function; is called, not referenced | L3.17 |

Every row is a fallback, never wrong output. That property — a divergence in
this direction can only lose coverage — is what makes the direction the safe
one.

## F-Exc — the two exceptions

Shape rejects; the folder accepts. Each is stated with why it is tolerated
rather than fixed.

**F-Exc-Lazy — short-circuit laziness.** The folder evaluates `&&`, `||`,
`??` and `?:` lazily and never folds the untaken operand; the classifier is
flow-insensitive and requires every operand to be shape-valid (L2.9, L3.13).
`false && sideEffect()` folds to `false` and is a lint error. *Tolerated
because:* a flow-sensitive classifier is an evaluator, and the cost of the
false positive is a visible lint error on code whose untaken branch is
suspect anyway. The implementation's own module doc calls it a wart, and a
specification should not launder the word.

**F-Exc-Registry — call-form registration without a registry.** The
classifier takes `ρ` as an optional parameter. Given one, its answer for a
plain call is the folder's own; without one, every plain call is a violation,
including `Ref(bucket)` that the folder accepts (L2.12, L2.13). *Tolerated
because:* the registry-less answer is the conservative one, it is a
parameter rather than a guess, and the lint engine now threads the active
lexicons' registry through (chant#1106) so the exception is closed in
practice for `chant lint` while remaining true of the classifier in
isolation.

There is no third exception. An implementation that discovers one has found
either a bug or a new rule, and must add it here before shipping it.

## What this file does not claim

That the classifier and the folder agree. They do not, and the enumeration
above is the point. The claim is narrower and more useful: **every
disagreement outside F-Exc costs coverage, never correctness**, and the two
that go the other way are named, bounded, and justified.
