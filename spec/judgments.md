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

## J2 — Per-file verdict `B, ι ⊢ f ⇓ fold(X, L) | run(reason)` (#14)

Formalises R4.1, R6.1, R6.6, R2.1, R2.2, R7, R8, R9.3. Derived from
`tryFoldFileCore` (`fold-import.ts:3539`), `buildExternals` (`:3345`),
`resolveDeclaratorValue` (`:3522`), `resolveLiveValue` (`:1331`),
`resolveCallExpression` (`:1416`), at `e4074c17`.

`ι ∈ {open, isolated}` is the isolation mode (#36). On `fold`, `X` is the
complete export namespace (R5.1) and `L ⊆ F` the files whose objects `f`
captured (F-Capture, J3). The verdict is evaluated per file, without regard
to other files' verdicts except through F-Import; it is *tentative*, and J3
makes it final. Every `run(reason)` carries a located reason (R9.3).

### Preconditions on the file

**F-NotProject.** A file inside chant's own module tree is not project source
and is `run("chant's own module is not project source")`. Trust (R2.1) is
about what may be *imported*; this is about what may be *folded*.

**F-Scan.** The statement gate (grammar §1). If any exported statement matches
S-Disqualify, `run(reason)` naming the construct. Otherwise the admitted
declarators are, in source order: resource, single, destructure,
named-export, re-export, function.

**F-NoExports.** If the gate admits the module but yields **zero**
declarators — a file with no exports, or only type-only ones — the verdict is
`run("no foldable resource exports")`. A file has to export something for
folding to have anything to produce; it is not folded to an empty namespace.

### Scope

**F-Bind.** `consts` is every top-level `const ⟨Identifier⟩ = e` (R6.6,
exported or not); `locals` is every top-level binding the resolver may read
by name — the same set, plus destructured locals from a composite call
(`const { a } = C({…})`). Resolution consults `locals`/`consts` before
`externals` (R6.6).

**F-Import.** For each named import binding `n` of `f`:

- *`params`* (R8): if the build has a binding `P` and `n` is `params` from
  chant's params module — bare `@intentius/chant/params`, or a project path
  that resolves to it — then `externals[n] = P`.
- *bare specifier, active lexicon package* (R2.1 arm 1): `externals[n]` is
  the package's real export, obtained by importing the already-loaded
  package. A lexicon package is never a member of `F` and is never folded.
- *bare specifier, anything else*: **not resolved**. `n` is absent from
  `externals`; a reference to it is an unresolved identifier (F-Reference).
- *project specifier* `g`: `g` is folded first (F-Memo: at most once per
  build; F-Cycle if `g` is already on the resolution stack). If
  `B, ι ⊢ g ⇓ fold(X_g, _)` then `externals[n] = X_g[imported]`, and if that
  value has identity — `typeof` object **or function** — then `g ∈ L(f)`
  (F-Capture). If `g`'s verdict is `run`, `n` is not resolved and the reason
  is recorded against `n` for diagnostics only.

**F-Namespace.** `import * as ns from "./g"` resolves to a *synthetic plain
object* of `X_g`'s entries, so `ns.x` indexes it like any object; `g ∈ L(f)`
if any entry has identity. `import * as ns from "<package>"` is **never
resolved** — which is why `new ns.Type(...)` is rejected (R6.3, L3.15): the
class is unreachable through a namespace of a package.

**F-Reference.** An identifier absent from `consts`, `locals` and
`externals` is a located rejection `unresolved identifier: n` — or the
pointed `process` message (R8). An unresolved *import* that is never
referenced does not by itself force `run`.

### Producing the namespace

**F-Declarator.** Each admitted declarator produces one or more entries of
`X`. Any failure in any declarator is a failure of the file (F-Total).

- *resource* `export const x = new T(…)`: `foldResource` (J1) yields a
  `{__resource}` envelope, which is **revived** into a real instance by the
  class `T` resolves to through `f`'s own imports (R1.2, R7.1). Under
  `isolated`, a `T` from a project file is F-IsolatedRefusal.
- *single* `export const x = e`: if `e` is a call, F-Call; if a member or
  element access on a call's result, F-Call then index (base must be an
  indexable object); otherwise J1 on `e`, revived.
- *destructure* `export const { a, b: c } = e`: `e` must resolve to a
  composite instance or an indexable object; each element indexes it.
- *named-export* `export { a, b as c }`: each local name resolves through
  `locals` then `externals`.
- *re-export* `export { a } from "./g"`: `X_g[a]`, with `g ∈ L(f)` if it has
  identity — a re-export is a capture.
- *function* `export function φ`: `X[φ]` is a `FoldableFunction` marker
  (R1.3); the body's own foldability is judged at the call, never here.

**F-Call.** A call in declarator position, callee `c`:

1. `c` must be a bare identifier; otherwise `run(callExpressionMessage)`.
2. If `externals[c]` is a `FoldableFunction`, the call is J1's project-local
   call (R6.5): evaluated statically, nothing imported.
3. Otherwise `c` must be an import binding; else `run`.
4. If the binding is *interpretable* (R7.2, rules 1–5): the factory body is
   **interpreted** against the defining module's scope; the module is never
   imported; `factoryInterpretations += 1` (R9.2).
5. Otherwise, under `ι = isolated`, F-IsolatedRefusal unless the binding is
   trusted (R2.1).
6. Otherwise the module is imported (once per build) and `c` **invoked** with
   the resolved arguments; `factoryInvocations += 1`, and
   `projectFactoryInvocations += 1` if the specifier is a project file.
   Arguments that are live objects pass through unchanged; a `{__attrRef}`
   among them stays symbolic (R1.2, L6.9).
7. The result must be a `CompositeInstance` or a `Declarable`; otherwise
   `run`.

**F-Count.** Within `f`, a composite call reached by several member accesses
or destructured names is resolved once (`ResolveCtx.memo`); a same-file
`new` bound to a `const` is constructed once, in source order (R4.6).

**F-IsolatedRefusal.** Under `ι = isolated`, any step above that would
resolve *and invoke or import* a binding not on the trust allowlist (R2.1) —
a project-owned factory, constructor, or intrinsic — is
`run("isolation")`, even where `B, open ⊢ f ⇓ fold(…)`. Interpretation (step
4) is not an invocation and is unaffected. Observable: R9.2's
`projectFactoryInvocations` is zero across every folded file under
`isolated`.

### The verdict

**F-Total.** If every declarator succeeded, `fold(X, L)` where `X` maps every
exported name to its value — plain values included — and `L` is the capture
set accumulated by F-Import, F-Namespace, re-exports, and F-CallLeak (J3).
If any declarator failed, `run(reason)` for the **whole file**: no partial
namespace is ever produced (R4.1).

**F-Reason.** `reason` names the declarator and carries the innermost located
cause; for a failure inside a project-local call it is re-anchored at the
call site with the callee's file and position in the message (R9.3).

### What J2 does not decide

Whether `f` *finally* folds. A file with `B, ι ⊢ f ⇓ fold(X, L)` may still be
`run` after J3, because a file it imports runs (forward taint) or because a
file it captured from runs (backward taint). J2's `fold` is a proposal; J3
disposes.

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
