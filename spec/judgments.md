# Judgments

Normative draft. Three judgments: expression evaluation (#13), the per-file
fold-or-run verdict (#14), and the identity-taint fixpoint (#15). This file
currently carries the third in full; the first two are stubs pointing at the
requirements they will formalise. Identifiers are `F-*` per #6: every rule
here needs resolution, a registry, or the module graph, and is not decidable
from syntax.

Derived from `planFoldTaint` (`fold-import.ts:3890`),
`buildProjectImportEdges`, `FoldSession`, `FoldFileResult.liveSources`, and
`FoldableFunction.leakedIdentity` (`fold.ts:378`), at `e4074c17`.

---

## J1 — Expression evaluation `Γ, H ⊢ e ⇓ v` (#13)

Stub. Formalises R1, R3, R6.3–R6.6, R7.3, R10. Environment `Γ` is the
`consts`-then-`externals` lookup of R6.6; `H` is the host (R7, #16); `v`
ranges over the value domain of R1.

## J2 — Per-file verdict `B ⊢ f ⇓ fold(X, L) | run(reason)` (#14)

Stub. Formalises R4.1, R6.1, R2.2, R9.3. On `fold`, `X` is the complete export
namespace (R5.1) and `L ⊆ F` the set of files whose objects `f` captured. This
judgment is evaluated **in isolation** per file; its verdict is *tentative*,
and J3 is what makes it final.

---

## J3 — The identity-taint fixpoint

### Why this judgment exists

Per-file partial evaluation is unsound in the presence of object identity
unless something makes it sound. If file `A` folds and file `B` runs, and both
refer to an entity `e` that `A` produced, then `B`'s real import of `A`
constructs a second `e`, and the build holds two objects for one entity —
whose `AttrRef`s cannot both receive a logical name and whose `Ref`s silently
inline instead of referencing. Every comparable system avoids the problem by
not having it: compile-time function execution copies values across the
boundary, per-page static rendering shares no runtime objects across it, and a
whole-program partial evaluator has one heap ([`prior-art.md`](./prior-art.md)).
chant keeps per-file granularity **and** shared identity, and this judgment is
the price.

### Setting

A build is `B = (F, →, P)`:

- `F` — the finite set of discovered project files.
- `f → g` — `f` imports or re-exports from `g`, by a relative or absolute
  specifier, `g ∈ F`. (`buildProjectImportEdges`. Bare specifiers are not
  edges: a package is never a member of `F`.)
- `P` — the build-parameter binding (R8).

J2 gives each `f` a tentative verdict `w(f) ∈ {fold, run}`; when
`w(f) = fold` it also gives `X(f)` and `L(f)`.

### Definitions

**F-Capture.** `f` *captures* `g`, written `f ⇝ g`, iff `w(f) = fold` and some
value in `X(f)` is a **non-primitive** obtained from `X(g)` — a `Declarable`, a
`CompositeInstance`, or any other object reached through `f`'s resolved
imports of `g`. Recorded as `g ∈ L(f)`. A primitive is never a capture: it
has no identity to disagree about (L8.5).

**F-CallLeak.** Let `φ` be a project-local function defined in `g` and called
from `f` during `f`'s fold. If the call **returns** a value that carries a live
object (R1.4) *which was not already carried in by the arguments*, then the
call leaked `g`'s identity into `f`: `leakedIdentity(φ)` is set and `g ∈ L(f)`
(L5.9). A function returning only plain data never leaks, which is what keeps
a parameter helper from tainting anything. F-CallLeak is F-Capture through
invocation rather than through import; the edge it records is the same edge.

**F-Memo.** Within one build, `w`, `X` and `L` are computed **at most once per
file**, and every reference to `X(g)` from any `f` resolves to the same
objects (`FoldSession.cache`, L8.11). Without this, F-Capture would record an
edge to a *copy*, and the judgment would be vacuous.

**F-Count.** Within one file, a composite call reached through several member
accesses or destructured names is invoked once, and a same-file construction
bound to a `const` is built once in source order; every reference reads the
same object (L8.12, L3.8, R4.6). F-Memo across files, F-Count within one.

### The fixpoint

```
Seed(B)   =  { f ∈ F : w(f) = run }                                        -- F-Seed
Succ(f)   =  { g : f → g }  ∪  { c : c ⇝ f }                                 -- F-Succ
T(B)      =  μX . Seed(B) ∪ ⋃_{f ∈ X} Succ(f)                                 -- F-Taint
Verdict:     fold(f)  iff  f ∉ T(B)        run(f)  iff  f ∈ T(B)             -- F-Verdict
```

**F-Succ, read carefully.** Taint flows from a tainted file `f` in two
directions at once:

- *forward along imports* — to every `g` that `f` imports (`f → g`). If `f`
  runs, its real import of `g` will construct `g`'s entities; a folded `g`
  would be a second copy. So `g` runs too, even if `w(g) = fold`.
- *backward along captures* — to every `c` that captured `f`'s objects
  (`c ⇝ f`). If `f` runs, the instance `c` captured during its fold is no
  longer the instance the build collects; `c`'s folded result is stale. So `c`
  runs too, and re-obtains everything through real imports.

The first revision of `requirements.md` R4.2 stated the forward direction as
"a file that imports a non-folding file is tainted." That is the *opposite*
edge, and it is not how taint propagates — it is handled earlier, by J2: a
file whose import cannot be resolved to a folded `X(g)` fails to fold on its
own and is in `Seed`. Corrected there in the same commit as this file.

**F-Fix.** `T(B)` is the least fixpoint of a monotone operator on the finite
lattice `𝒫(F)`, so it exists and is reached in at most `|F|` iterations. The
implementation computes it by a worklist from `Seed`; the specification
states the fixpoint so an implementation is free to compute it otherwise.

**F-Cycle.** A cycle in `→` encountered during *resolution* (J2, computing
`X(g)` for an import that transitively needs `X(f)` again) is a located error
naming the cycle path (`FoldSession.stack`, L8.9), not an infinite regress.
The fixpoint itself is indifferent to cycles in `→`.

### The property

**Proposition (one instance per entity).** In a build whose verdicts are
`F-Verdict`, every entity `e` produced by the build is represented by exactly
one object, and every reference to `e` — from a folded file's `X`, from a run
file's import, from an `AttrRef` — is that object.

*Sketch.* Let `e` be produced by file `g`.

1. If `g ∉ T(B)`, `g` folded, and `e` is the object in `X(g)` — unique by
   F-Memo and F-Count. Any `f` referring to `e` either folded and captured it
   (`f ⇝ g`), in which case `f ∉ T(B)` — else `g ∈ T(B)` by the backward edge,
   contradiction — and `f`'s reference is the F-Memo object; or `f` runs,
   `f → g`, and then `g ∈ T(B)` by the forward edge, contradiction. So every
   referrer folded and holds the one object.
2. If `g ∈ T(B)`, `g` runs, and `e` is constructed by real execution. Any `f`
   with `f → g` has `g ∈ Succ(f)`; if `f ∉ T(B)` then `g ∉ T(B)`,
   contradiction; so `f` runs and its import of `g` is the run path's own
   module instance — one per file, by the host module system (or the single
   bundle under isolation, R2.2). Any `f` with `f ⇝ g` is in `T(B)` by the
   backward edge and its folded capture is discarded.

No entity therefore has both a folded and a run object alive. ∎

The sketch relies on two things outside this judgment: F-Memo/F-Count (the
implementation's session and per-node memos), and the run path's own
one-instance-per-module guarantee. The second is why isolation bundles every
run-fallback file into **one** module graph rather than one per file (R2.2):
two bundles would be two module instances of a shared import, and the
proposition would fail on the run side.

### Consequences worth stating

**Leaf fixes buy nothing while an importer still runs.** Because taint flows
forward into imports, a perfectly foldable leaf imported by a running file
runs. This was observed empirically before it was understood (chant#1107:
coverage fell after a leaf was made foldable) and is a direct corollary of
F-Succ. An implementation must not "optimise" it away; it is the soundness
condition.

**A folded file can still be forced to run by a file it never imports.** The
backward edge means `c`'s verdict depends on the verdict of a file `c` only
*captured from*. Nothing in `c`'s own source predicts it. Fallback reporting
(R9.3) must therefore be able to say "forced to run because `f` runs and you
captured its objects," not merely quote a construct in `c`.

### Validation status

The differential that discharges the objective (chant#1025) currently compares
fold against run **only for builds where `T(B) = ∅`** — every file folded
(chant#2345). Those are exactly the builds in which this judgment does
nothing. The proposition above has no differential evidence for the mixed
case, and until chant#2345 lands, the claim rests on the argument here and on
the crash class it was written to prevent (chant#1044, #1020).
