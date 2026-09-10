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

## The objective every judgment serves

**At a fixed build-parameter binding, folding a file and running it are
observationally equivalent.**

A source file may be reduced from its AST to the entities it declares, or
imported and executed, and the build cannot tell which happened from the
output. In chant this is discharged by a differential over the example corpus
asserting identical errors and byte-identical serialized output
(INTENTIUS/chant#1025) — with the caveat that the differential currently
compares only entries where every file folded (INTENTIUS/chant#2345), so the
mixed case, which is where the interesting requirements below actually fire,
has no differential evidence yet.

The binding is part of the statement, not a footnote. `params.<name>` folds to
a literal supplied at build invocation (F-Import, J2), so output is a function of source
*and* binding; "same source, same output" is true only with the binding held
fixed.

Equivalence is what makes the fallback safe, and the fallback is what
distinguishes this from a configuration language that rejects out-of-subset
source. But — per [`prior-art.md`](./prior-art.md) — graceful fallback is not
itself new. What is new is that the fallback coexists with shared object
identity across the fold/run boundary, which is why J2 and J3 exist.

---

## J1 — Expression evaluation `Γ, H ⊢ e ⇓ v` (#13)

Formalises R1, R3, R6.3–R6.6, R7.3, R10. `Γ = (consts, externals, depth)`
per R6.6 — `depth` is the number of project-local function bodies being
folded around `e`, 0 at a file's top level. `H = (ρ, helpers)` is the host
(hosts.md): the intrinsic registry and the authoring-helper allowlist. `v`
ranges over the value domain (values.md); `⟦e⟧` abbreviates
`Γ, H ⊢ e ⇓ v`. Every rule that fails does so with a located rejection
(R9.3). Derived from `fold()` (`fold.ts:896–1300`), `foldResource`,
`foldTaggedTemplate`, `foldIntrinsicValue`, `callFoldableFunction`, at
`e4074c17` with chant-v0.63.0's `?.` rules. Rules are keyed to the grammar's
productions.

**F-Eval-Unwrap.** `⟦(e)⟧ = ⟦e as T⟧ = ⟦e satisfies T⟧ = ⟦e!⟧ = ⟦e⟧`. A `!`
that is part of an optional chain continues the chain (F-Eval-Member).

**F-Eval-Literal.** A string or no-substitution template folds to its text; a
numeric literal to `Number(text)`; `true`, `false`, `null` to themselves.
**F-Eval-Undefined.** The identifier `undefined` folds to `undefined`.

**F-Eval-Ident.** For identifier `n`, in order (R6.6):
1. `n ∈ consts` with initializer `new …`: if `n ∈ externals`, `⟦n⟧ =
   externals[n]` (the one instance J2 pre-built, R4.6); else **reject** —
   re-folding would construct a duplicate (F-Div-SameFileNew).
2. `n ∈ consts` otherwise: `⟦n⟧ = ⟦consts[n]⟧`.
3. `n ∈ externals`: if it is a `FoldableFunction`, **reject** (F-Val-Callable);
   if it is a function and `ρ` registers `n` as eager, **reject** ("call it
   instead"); otherwise `⟦n⟧ = externals[n]` unchanged — a live object passes
   through (F-Val-Live).
4. `n = process`: **reject** with the build-parameters message (R8).
5. Otherwise **reject** `unresolved identifier: n` (F-Reference).

**F-Eval-Template.** `⟦`h ${e₁} t₁ … ${eₖ} tₖ`⟧ = h ⧺ ToString(⟦e₁⟧) ⧺ t₁ ⧺ …`
(R10.4). *Recommendation carried from R10.4:* an envelope among the `⟦eᵢ⟧`
should be a rejection; the implementation currently coerces it.

**F-Eval-Tagged.** For `tag`…``: if `depth > 0`, **reject** (R6.3). If `ρ`
does not register `tag` with `isTag`, **reject**. Otherwise
`{__intrinsic: tag, strings, values}` where each interpolation is folded by
**F-Eval-Interior**.

**F-Eval-Interior.** Inside an intrinsic's interior — a tag's interpolations
or a call form's arguments — if `e` is an identifier, or a `.`/`[]`/`!`
chain rooted at one, that is not `undefined` and is in neither `consts` nor
`externals`, then `⟦e⟧ = {__symbol: text(e)}` (F-Val-Symbol-Scope).
Otherwise `⟦e⟧` as usual. A resolvable root is never symbolised: a cross-file
binding must reach the intrinsic as the shared object (J3).

**F-Eval-Object.** Members in source order into a fresh object: `k: e` sets
`k ↦ ⟦e⟧` (`k` must be a literal key, else reject); shorthand `n` sets
`n ↦ ⟦n⟧`; `...e` requires `⟦e⟧` to be a non-null object and copies its own
enumerable entries in their order, later keys winning (R10.5, R10.6). Any
other member kind rejects.

**F-Eval-Array.** Elements in order into a fresh array; `...e` requires
`⟦e⟧` to be an array (`Array.isArray`) and splices its elements (R10.6).

**F-Eval-Member.** For `o.m` (or `o?.m`), in order:
1. If `o` is an identifier in `consts` whose initializer is `new …`:
   `⟦o.m⟧ = {__attrRef: {entity: o, attribute: m}}` (R10.3), before anything
   else — the reference is by *name*.
2. If `m = step` and `o` is a call whose callee is an unclaimed bare
   identifier (L3.20): if `depth > 0` reject; else
   `{__compositeStep: callee, args: ⟦args⟧}`.
3. Let `x = ⟦o⟧`. If `x` is the chain-short-circuit sentinel: propagate it
   if this access continues the chain, else `undefined`.
4. If `x` is `null` or `undefined`: with `?.`, yield the sentinel (or
   `undefined` if nothing continues the chain); with `.`, **reject**
   naming `m` and pointing at `?.` (R10.2, chant-v0.63.0).
5. If `x` is a `{__resource}` envelope: if `o` is a plain identifier,
   `{__attrRef: {entity: o, attribute: m}}`; else **reject** (R10.3,
   chant#1535).
6. Otherwise `⟦o.m⟧ = x[m]` — a plain index, which on a live instance runs
   its real getter and yields a real `AttrRef` (F-Val-Live).

**F-Eval-Index.** `o[k]`: `k` must be a string or numeric literal, else
reject (EVL003). Then as F-Eval-Member with `m = k`.

**F-Eval-Unary.** `⟦!e⟧ = ¬truthy(⟦e⟧)`; `⟦-e⟧ = −ToNumber(⟦e⟧)` (R10.1).
Any other operator rejects.

**F-Eval-Binary.** `&&`, `||`, `??`: fold the left; fold the right **only**
if ECMAScript would (falsy / truthy / nullish respectively); result per
ECMAScript (F-Exc-Lazy). Every other supported operator: fold both, then
apply the ECMAScript operator (R10.1). An unsupported operator rejects.

**F-Eval-Conditional.** `⟦c ? t : f⟧`: fold `c`; fold **only** the taken
branch (F-Exc-Lazy).

**F-Eval-New.** For `new C(a₁ … aₙ)`: `C` must be a plain identifier, else
reject (F-Div-NsNew). If `depth > 0`, reject (R6.3). Then
(F-Val-Arity): with no arguments, `{__resource: C, props: {}}`; with `a₁`
an object literal and `n = 1`, `{__resource: C, props: ⟦a₁⟧}`; with `n = 2`
and both object literals, `{…, attributes: ⟦a₂⟧}`; otherwise
`{__resource: C, props: p, args: [⟦a₁⟧ … ⟦aₙ⟧]}` where `p` is the first
object-literal argument folded, or `{}`.

**F-Eval-CallHelper.** For `h(args)` with `h ∉ consts` and `h ∈ helpers`: if
`depth > 0` reject; else `{__helper: h, args: ⟦args⟧}`. Provenance is not
checked here (F-Div-Provenance); revival checks it.

**F-Eval-CallIntrinsic.** For `i(args)` with `i ∉ consts` and `ρ` registering
`i` with `foldsAsCall`: if `depth > 0` reject; else
`{__intrinsic: i, args}` with each argument by F-Eval-Interior.

**F-Eval-CallLocal.** For `φ(args)` where `externals[φ]` is a
`FoldableFunction` (checked *after* the two registered shapes, so a
registered name keeps its meaning):
1. `φ`'s declaration must satisfy S-FnBody, else reject naming the reason.
2. If `depth ≥ 32`, reject ("call depth exceeded").
3. A spread argument rejects. Each `aᵢ` folds in the **caller's** `Γ`.
4. The body folds in `Γ' = (consts_φ, externals_φ, depth + 1)` — the
   *defining* module's scope — with each parameter bound by removing its
   name from `consts_φ` and setting it in `externals_φ` (so it shadows);
   an object-pattern parameter destructures its argument, which must be an
   object; a missing argument with a default folds the default in `Γ'`.
5. A concise body yields `⟦body⟧`; a block yields `⟦return-expr⟧` after
   folding each `const` in order, or `undefined` if there is no `return`.
6. If the result carries a live object (F-Val-Live) that no argument
   carried, `leakedIdentity(φ)` is set (F-CallLeak, J3).
7. A rejection inside the body is re-thrown at the call, naming `φ`, its
   file, the inner position, and the reason (R9.3).

**F-Eval-CallEager.** For `g(args)` with `g ∉ consts` and `ρ` registering `g`
with `foldsEagerly`: `externals[g]` must be a function, else reject; then
`⟦g(args)⟧ = g(⟦args⟧)` — evaluated now, the result possibly live (R7.3).

**F-Eval-CallMethod.** For `o.m(args)` (or `o?.m(args)`): let `x = ⟦o⟧`.
If `x` is the chain sentinel, propagate. If `x` is `null`/`undefined`: with
`?.`, sentinel; with `.`, reject. If `x` is an envelope, reject — else
`toString` would answer with the placeholder's shape (L3.18). If `x[m]` is
not a function, reject. Else `⟦o.m(args)⟧ = x[m].apply(x, ⟦args⟧)`.

**F-Eval-Function.** An arrow or function expression in value position
rejects (F-Val-Callable).

**F-Eval-Reject.** Any expression matching no rule above rejects with
`unsupported expression` (S-Reject).

### What J1 does not do

Revive. Every envelope J1 produces is a finished value (F-Val-Envelope) that
J2 hands to revival. J1 executes nothing of the folded file's own — its only
executions are F-Eval-CallEager and F-Eval-CallMethod on real receivers,
both of which run code the file *imported*, not code it wrote (R2, R7.3).

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

**F-Seed.** `Seed(B)` is every file whose tentative J2 verdict is `run`.
Nothing else is ever in the seed: a foldable file enters `T` only by
propagation.

**F-Succ.** `Succ(f)` is the set of files `f` taints. Read carefully — taint
flows from a tainted file `f` in two directions at once:

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

**F-Taint.** `T(B)` is the least set containing `Seed(B)` and closed under
`Succ`. **F-Verdict.** A file's final verdict is `fold` iff it is not in
`T(B)`.

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

Until chant#2345 (landed 2026-09-10 as chant PR #2364) the differential that
discharges the objective (chant#1025) compared fold against run **only for
builds where `T(B) = ∅`** — every file folded — which are exactly the builds
in which this judgment does nothing. chant#2345 removes that early return: every non-empty corpus entry is now
built both ways and held to error parity and byte-identical output, with a
shrink-only allowlist for known divergences.

**First full run, 2026-09-10:** 107 entries, 95 fully folded, 12 with at
least one run-fallback file — **drift 0**, allowlist empty. Every mixed
entry, where `T(B) ≠ ∅` and both taint directions can fire, agrees fold-vs-
run. That is the proposition's first differential evidence; before it the
claim rested on the argument above and on the crash class it was written to
prevent (chant#1044, #1020). Twelve entries is a small sample and they are
chant's own examples; an adversarial mixed corpus (chant#2347) is what would
make it strong.

---

## J4 — Properties and observables

Rules that are about the whole mechanism rather than one judgment.

**F-NoOwnExecution (property).** For every file with final verdict `fold`,
none of its top-level statements is executed by the build. What still
executes is bounded and named: revival of envelopes (F-Val-Fate),
F-Eval-CallEager, F-Eval-CallMethod on a real receiver, and — under `open` —
invocation of an imported factory (J2 F-Call step 6). All of it is code the
file *imported*; none of it is code the file *wrote*. (Was R2.)

**F-Depth.** Three bounds each turn exhaustion into `run`, never into wrong
output: `MAX_FUNCTION_CALL_DEPTH = 32` on nested project-local calls
(F-Eval-CallLocal step 2), `MAX_INTERPRETATION_DEPTH` on nested factory
interpretation, `MAX_RESOLUTION_DEPTH` on the cross-file resolution stack.
An implementation may choose its own values; it must state them and must
fall back, not fail. (Was R4.5.)

**F-Obs-Counters.** A conforming implementation exposes, per build and
resettable, three non-negative integers: in-process factory/constructor
invocations performed while folding; of those, how many resolved to
project-owned code; and how many factory bodies were interpreted instead.
Names are not normative; the shape is. Under `isolated` the second is zero
across every folded file (F-IsolatedRefusal). (Was R9.2, R2.3.)

**F-Obs-Report.** A conforming implementation reports, per file, the final
verdict and — for `run` — a located reason (F-Reason). A fallback is not an
error, which is exactly why an unreported one would make F-NoOwnExecution
unauditable. Summary versus verbose is presentation. A reason produced by
J3's backward edge must be able to say "forced to run because `f` runs and
you captured its objects", since nothing in the file's own source predicts
it. (Was R9.3.)

**F-Obs-Provenance.** Path provenance — which composite parameter produced
which emitted field, first (innermost) writer wins — is an *optional*
capability outside the equivalence objective: the run path does not
uniformly produce it, so requiring it would oblige fold and run to agree on
something one side lacks. Conformance reports whether it is supported.
(Was R9.1.)

**F-Obs-Messages.** Message *stability* is not normative. Location and rule
identifier are (F-Reason). One-builder-per-kind is a property of one
implementation's tooling; a second implementation cannot share strings.
(Was R9.4.)

---

## Rationale

Non-normative. The reasoning that motivated each rule, carried over from the retired `requirements.md` (#46). Keyed by the rule(s) each note supports.

**F-NoOwnExecution** *(was R2 — Folding executes none of the folded file's own statements, and the spec must say exactly that)*

The claim is narrower than "no execution", and stating it loosely is the single
easiest way to write a specification that is either false or useless.

**Guaranteed:** none of the top-level statements of the file being folded are
executed. That is the whole of the guarantee.

**Still executes:** revival (R1.2) and eager evaluation (R7.3). A `__resource`
envelope names a constructor; the bridge reads the folding file's own `import`
declarations, imports *that* module, and calls the real class with the folded
arguments. The implementation's own justification: the run path imports the
same module to obtain the same class, so the only thing skipped is the file's
own statements (`fold-import.ts` module doc).

**F-IsolatedRefusal** *(was R2.2 — Isolation changes what folds, so it is part of the mechanism)*

Under sandboxed execution a fold whose revival would invoke *project-owned*
code is refused and the file falls back to run (L9.5,
INTENTIUS/chant#1093). The fold/run decision is therefore parameterized by
whether project code may execute in this process.

**Decided (#36): isolation is an optional capability, modelled in the
judgment.** J2 takes an isolation mode `ι ∈ {open, isolated}`; under
`isolated`, a file whose fold would require invoking project-owned code is
`run`, not `fold` (F-IsolatedRefusal, judgments.md). An implementation
declares whether it supports `isolated`; conformance reports it separately
and does not require it. The observable is R9.2's `projectFactoryInvocations`
counter, which must be zero for every folded file under `isolated`. Nix
import-from-derivation is the cited precedent for evaluation escaping into a
contained execution and resuming (`prior-art.md`). The reference
implementation is not required to ship a sandbox before submission.

**F-Obs-Counters** *(was R2.3 — The observable)*

`FoldExecutionCounts` (L10.1) — `factoryInvocations`,
`projectFactoryInvocations`, `factoryInterpretations` — is how this
requirement is checked rather than trusted. #43 decides what a conforming
implementation must expose.

---

**J3** *(was R4 — The decision is per file, total, and closed under a bidirectional fixpoint)*



**F-Total, F-Scan** *(was R4.1 — All or nothing, per file — at the normative entry point)*

Two entry points exist and the first revision conflated them. `tryFoldFile`
returns a `FoldFileResult` (L8.1): ok with the complete export namespace, or a
reason. One unrecognized export disqualifies the file (L8.2). `foldModule`
(L8.3) is per-export, carries an ok/false entry per declaration, and silently
skips non-`new` exports. **The per-file entry point is normative**; the
per-export one is a diagnostic surface, and the spec must say so.

The reason fallback is per-module rather than per-declaration is stated in the
statement gate itself (L1.7) and belongs in the spec: an unfoldable export can
reference or be referenced by a foldable one in ways only running proves safe.

**F-Succ, F-Capture, F-CallLeak** *(was R4.2 — Contagion runs in both directions, and through calls)*

`planFoldTaint` (L8.6–L8.8):

- **Forward, along imports.** A tainted file taints every file it imports or
  re-exports from: if `f` runs, its real import of `g` constructs `g`'s
  entities, and a folded `g` would be a second copy — so `g` runs even if it
  would have folded alone. (The first revision stated this edge backwards —
  "an importer of a non-folding file is tainted" — which is not the taint walk
  at all but J2's resolution failure putting the importer in the seed.
  Corrected with judgments.md J3.)
- **Reverse.** A file whose *objects were captured* by an already-folded file
  taints the capturer. `liveSources` records only non-primitive captures
  (L8.5) — a primitive has no identity to disagree about.
- **Through calls.** A project-local function whose call *returns* a live
  object the body produced — not one merely passed through the arguments —
  records the same taint edge (L5.9, `leakedIdentity`). Identity propagates
  through invocation, not only through import, and the first revision missed
  this entirely.

**F-Taint, F-Fix** *(was R4.3 — The fixpoint and its termination)*

Seed with every file that would not fold on its own; walk the union of forward
and reverse edges to closure. Monotone over a finite file set, so it
terminates. State it as a least fixpoint, not as the worklist.

**F-Cycle** *(was R4.4 — Cycles are a located error, not divergence)*

`FoldSession.stack` (L8.9) detects a genuine reference cycle and reports the
path.

**F-Depth** *(was R4.5 — Three depth bounds, all of which decide fold versus run)*

`MAX_FUNCTION_CALL_DEPTH = 32` (L5.8), `MAX_INTERPRETATION_DEPTH` (L7.8),
`MAX_RESOLUTION_DEPTH` (L8.10). Each terminates a different recursion and each
turns exhaustion into a fallback. No requirement in the first revision
mentioned them. The spec must either fix the bounds or say they are
implementation-defined and that exceeding one is a fallback, never wrong
output.

**F-Count** *(was R4.6 — Evaluation count is observable semantics)*

A composite call reached through several member accesses or destructured names
is invoked **exactly once** (L8.12, `ResolveCtx.memo`), explicitly "matching
what actually running the file would do." A named same-file construction is
built once, in source order, and every reference reads the same object (L3.8).
These are not optimizations; an implementation that invoked twice would produce
two entities where running produces one.

---

**F-Memo** *(was R5 — A cross-file entity has exactly one instance per build)*

Every referrer of a folded file must observe the same objects. A per-build
session memoizes each file's fold so a file imported by many is folded exactly
once (L8.11), and revival passes live objects through unchanged rather than
reconstructing them (L6.1) — the generic walk would destroy the identity it
exists to preserve.

**F-Total** *(was R5.1 — The exported namespace is complete, and the statement gate is why)*

A successful fold yields every exported name's value, not only the
entity-valued ones (L8.4). This holds *because* the statement gate (R6.1)
disqualifies any file with an unrecognized export. The first revision stated
the property without its enforcement.

**F-Succ** *(was R5.2 — R5 is why R4.2 exists)*

The reverse and through-call taint edges are the consequence of this
requirement: single-instance-per-build cannot hold if one side of a sharing
relationship folds while the other runs.

---

**F-Eval-New, F-Eval-Tagged, F-Eval-CallHelper, F-Eval-CallIntrinsic, F-Eval-Member step 2** *(was R6.3 — Admissibility depends on where the expression sits)*

Five constructs that fold at a file's top level are refused inside a folded
function body: `new`, a tagged template, a helper call, an intrinsic call, and
`.step` (L3.16, `functionBodyDepth`). Each produces an envelope revived against
the *caller's* imports, which is not the scope the body was written in.
`new ns.Type(...)` is refused everywhere: a namespace-qualified constructor
cannot be resolved through named imports (L3.15).

**F-Eval-Ident** *(was R6.4 — Shadowing)*

`consts` is consulted before `externals` (L5.3). A local `const` defeats a
registered helper or intrinsic name — the file's own binding wins, so a local
`Ref` is not the lexicon's. A parameter or body binding shadows a module-level
const of the same name.

**F-Bind, F-Eval-Ident, F-Eval-CallLocal** *(was R6.6 — What a binding is, and the order names resolve in)*

**A top-level binding is a `const` with an identifier name and an initializer**
(`collectConsts`, L5.1). Nothing else is: a top-level destructured `const`
(`const { a } = …`) does not bind `a` for the folder, and a non-exported
`const` is collected exactly like an exported one. The spec must say this
because the first is a surprise — the declaration is valid TypeScript and the
name is simply invisible.

**Lookup order is `consts`, then `externals`** (L5.2, `fold.ts` identifier
branch). A name in the file's own `consts` is never looked up in `externals`,
which is the mechanism behind R6.4's shadowing rule and must be stated as the
order rather than only as its consequence.

**A project-local function's body folds in the defining module's scope**
(L5.5, `callFoldableFunction`): the arguments fold in the caller's `consts`/
`externals`; the body folds against a copy of the *callee's* `consts` and
`externals`, with each parameter bound by deleting the name from that copy of
`consts` and setting it in `externals` (so a parameter shadows a module-level
const of the same name); `externals` are read live, so a function declared
before a const it reads still sees the const's value. R7.2 states the same
scope rule for composite factories; this is its counterpart for plain
functions, and without it a helper in `lib/` reading `lib/`'s own imports is
unspecified.

---

**F-Call** *(was R7 — There are three evaluation modes, not two)*

The first revision described fold-to-envelope and revival. There is a third,
and it is the one that makes folding under isolation possible.

**F-Call step 4** *(was R7.2 — Interpret, never importing the defining module)*

A composite factory is *interpreted* (L7.1–L7.8) when: (1) the calling file
imports it from a project file, by text, never a package; (2) the defining
module has `export const N = Composite(<fn>, "N")` with `Composite` bound in
*that* module to chant's own; (3) `<fn>` takes at most one plainly-bound
parameter; (4) its body is a concise expression or `const`s then a final
`return`; (5) every expression is in the subset, extended with `new` in value
position and calls through a bare identifier. A body that references one of
its module's own module-level resources declines (L7.6) — that resource is a
singleton the run path shares, and interpretation would not — and
`constResolvesToResource` follows alias chains so it cannot be smuggled in
(L7.7). The defining module is never imported; members are built by the
lexicon's constructors from the folded props.

**F-Eval-CallEager, F-Eval-CallMethod** *(was R7.3 — Evaluate eagerly)*

A lexicon function registered with `intrinsicCallFoldsEagerly` (L2.13) is
called at fold time with folded arguments rather than enveloped, because its
ordinary use coerces the result to string during folding, before any revival
would run. A method call on a real receiver (L2.14) is the same mode: the
receiver is the same object either way, so calling it is what running would
do. Both are places where fold time and revival time are observably different,
and the spec must name them as such.

---

**F-Import** *(was R8 — Build parameters are an input to folding)*

`FoldSession.buildParams` (L5.11) is consulted for exactly one bare specifier:
a named `params` import resolving to chant's `params` module. `params.<name>`
folds to a literal. A bare `process` reference is refused with a message naming
this mechanism as the alternative (L3.7). The `params` object is tracked by
identity like an entity (`fold-import.ts:3141`).

The objective is stated pointwise at a binding because of this requirement. An
implementation without build parameters satisfies it trivially; one with them
must say how the binding enters and that it is recorded.

---

**J4** *(was R9 — Outputs beyond values, and what must be observable)*

Folding produces more than the value tree, and the first revision had no place
for any of it. Four things, each decided here as a recommendation for the
normative text (#43).

**F-Obs-Provenance** *(was R9.1 — Provenance is an optional capability, outside the equivalence objective)*

`setPathProvenance` (L10.2) records, during fold, which composite parameter
produced which emitted field; the first (innermost) writer wins. It is real
output and it is useful. It is **not** part of the objective: the run path
obtains provenance, where it has any, by a different mechanism, and making
provenance normative would oblige fold and run to agree on a thing the run path
does not uniformly produce.

So: a conforming implementation *may* expose path provenance; conformance
reports whether it does; the equivalence claim is over serialized output only.
The first-writer-wins rule is stated for implementations that do expose it, so
two of them agree on which writer.

**F-Obs-Counters** *(was R9.2 — The no-execution observable is normative in shape, not in name)*

R2 is checkable only through `FoldExecutionCounts` (L10.1). A conforming
implementation must expose, per build and resettable: the number of factory or
constructor invocations performed in-process during folding; of those, how
many resolved to project-owned code; and how many factory bodies were
interpreted instead. Three non-negative integers. That is sufficient for a
conformance harness to assert "zero project-owned invocations" under isolation
(R2.2) and to measure interpretation coverage (R7.2). Names are not normative.

**F-Obs-Report, F-Reason** *(was R9.3 — Fallback reporting is normative)*

A fallback is not an error (R4.1), which is exactly why it must be reported: an
unreported fallback is indistinguishable from a fold, and R2's guarantee
becomes unauditable. A conforming implementation must report, per file, the
decision taken and — for a fallback — a located reason (L10.3). The reason's
wording is unconstrained.

**Which location, when there are two.** A rejection inside a project-local
function body has a position in the callee's file and a call site in the
caller's. The implementation re-throws at the **call site**, naming the callee,
its file, the position inside it, and the reason, preserving the rule
identifier (L5.10, `callFoldableFunction`). The reported location is the call;
the callee position travels in the message. The spec must say which is
primary, because R-spec.3's "located" is otherwise ambiguous for exactly this
case. Whether the report is summarized or verbose by
default is presentation, not conformance.

**F-Obs-Messages** *(was R9.4 — Message stability is not normative; location and rule are)*

chant builds every rejection message of a given kind through one shared
builder so two sites cannot drift (L10.5). That is a property of one
implementation's tooling: a second implementation in another language cannot
share strings, and requiring it would make the wording normative by the back
door. What conformance requires is already R-spec.3 — the node and the rule
identifier — and `FoldError` carries exactly those (L10.4).

---

**J1** *(was R10 — Semantics a second implementation cannot guess)*

R1 defines the domain and R3 defines membership. Neither says what an operator
*means*. "As ECMAScript" is the obvious discharge and it is available for most
of this section — but not all of it, and the places where the implementation
departs from ECMAScript are exactly the ones a second implementation would get
wrong by assuming it.

**F-Eval-Unary, F-Eval-Binary** *(was R10.1 — Operators are ECMAScript's, on the folded operand values)*

The supported binary operators (L2.8, L3.14): `+` `-` `*` `/` `===` `!==` `>`
`<` `>=` `<=`, and the lazy `&&` `||` `??` (L3.13). Unary `!` and `-`
(L3.12). Conditional `?:`. For every one of these the implementation applies
the host JavaScript operator to the folded values, so the semantics — including
`+`'s string-versus-numeric dispatch, relational comparison on strings, and
`&&`/`||` returning an operand rather than a boolean — are ECMAScript's. The
spec should say so per operator and require an implementation in another
language to reproduce ECMAScript coercion for these operators, not its host's.

**F-Eval-Member step 4** *(was R10.2 — Member access on `null`/`undefined` refuses; optional chaining short-circuits)*

Resolved by chant-v0.63.0 (INTENTIUS/chant#2328, commit `8ce54e5e`). A plain
property or element read whose object folds to `null`/`undefined` is
**refused** with a located rejection naming the member and pointing at `?.`
(L3.10); the file falls back to run, where the same expression throws a
`TypeError`. Fold produces no output and run produces an error — equivalence
in the sense of R4.1's "a fallback is not wrong output". `?.` is implemented
with ECMAScript short-circuit semantics: a nullish object under `?.` yields a
chain-short-circuit sentinel that propagates through the remainder of the
chain — further member and element reads, `!` non-null assertions, and a
`?.()` method call — and resolves to `undefined` where the chain ends (L3.21,
L3.22). So "as ECMAScript" *is* now available for member access, and the
departure the first revision of this clause recorded no longer exists. chant's
shape classifier still admits both forms (the object's value is resolution),
which is the R3.1 direction; it is added to R3.1's divergence list.

**F-Eval-Member steps 1, 5** *(was R10.3 — Attribute references are produced by two rules and refused by a third)*

Property or element access on an identifier bound to a same-file `new` yields
`{__attrRef: {entity, attribute}}` keyed by the identifier (L3.9). Access on a
value that folded to a `{__resource}` envelope yields the same, but only when
the object expression is a plain identifier — any other shape is refused,
because there is no name to key the reference on and silently indexing the
envelope produced wrong output (L3.11, chant#1535).

**F-Eval-Template** *(was R10.4 — Template spans coerce by ECMAScript `ToString`, and the spec must say what that does to an envelope)*

`String(fold(span))` (L3.2). For scalars that is ECMAScript. For a symbolic
envelope it is `"[object Object]"` — and, verified, the run path produces the
same, because `AttrRef` defines no `toString`. So fold and run *agree* and the
output is silently wrong on both; the implementation guards the
eager-intrinsic case for exactly this hazard (R7.3) and not the template span.
The spec should refuse an envelope in a plain template span rather than
inherit `ToString`; chant's side of it is tracked as a lint gap.

**F-Eval-Object, F-Eval-Array** *(was R10.5 — Key and element ordering are ECMAScript's, and byte-identity depends on it)*

Object literals evaluate members in source order; spread is `Object.assign`,
so spread keys land in the source's insertion order and a later key wins
(L3.3). Arrays preserve element order; spread splices in place. This is
ECMAScript object-literal evaluation and "as ECMAScript" is available here.

Whether order is *observable* depends on the emitter, verified in chant: a
lexicon whose serializer produces JSON is re-stringified through
`sortedJsonReplacer` (`packages/core/src/utils.ts:30`), which sorts every
object's keys, and YAML for those lexicons is derived from that sorted JSON
(`cli/commands/build.ts:743–746`) — so folded key order never reaches the
output. Six lexicons serialize YAML themselves (fountain, docker, gitlab, k8s,
gcp, github) and their text is emitted as-is, so for them the walker's
insertion order *is* the output order. The rule must therefore be stated: an
implementation targeting a host that preserves order would fail byte-identity
with a different key order, and nothing in the objective says which hosts
those are.

**F-Eval-Object, F-Eval-Array** *(was R10.6 — Spread departs from ECMAScript in one direction)*

Object spread requires a non-null object; array spread requires
`Array.isArray` (L3.4, L3.5). ECMAScript array spread accepts any iterable —
`[...'ab']` is `['a','b']` there and a rejection here. A deliberate narrowing,
and one a second implementation would not infer from "as ECMAScript".
