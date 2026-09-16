# J3. The identity-taint fixpoint

Derived from `planFoldTaint` (`fold-import.ts`),
`buildProjectImportEdges`, `FoldSession`, `FoldFileResult.liveSources`, and
`FoldableFunction.leakedIdentity` (`fold.ts`), at `e4074c17`.

### Why this judgment exists

Per-file partial evaluation is unsound in the presence of object identity
unless something makes it sound. If file `A` folds and file `B` runs, and both
refer to an entity `e` that `A` produced, then `B`'s real import of `A`
constructs a second `e`, and the build holds two objects for one entity,
whose `AttrRef`s cannot both receive a logical name and whose `Ref`s silently
inline instead of referencing.

Every comparable system avoids the problem by not having it
([`prior-art.md`](./prior-art.md)). Compile-time function execution copies
values across the boundary, per-page static rendering shares no runtime
objects across it, and a whole-program partial evaluator has one heap. chant
keeps per-file granularity **and** shared identity and this judgment is the
price.

### Setting

A build is `B = (F, →, P)`:

- `F`, the finite set of discovered project files.
- `f → g`, `f` imports or re-exports from `g`, by a relative or absolute
  specifier, `g ∈ F`. (`buildProjectImportEdges`. Bare specifiers are not
  edges: a package is never a member of `F`.)
- `P`, the build-parameter binding.

J2 gives each `f` a tentative verdict `w(f) ∈ {fold, run}`; when
`w(f) = fold` it also gives `X(f)` and `L(f)`.

### Definitions

**F-Identity.** Two identity predicates appear in this specification and they
are not interchangeable.

- The **entity test** (F-Val-Live) recurses through plain objects and arrays.
- The **reference test** (F-Import) is `typeof` object **or** function. It does
  not recurse and it admits a plain `{ a: 1 }` that the entity test rejects.

The proposition below is about *entities* — the values a build names and
serializes — and the entity test is the normative one for it. Two structurally
equal plain objects that no `AttrRef` points at cannot be told apart in the
output so
duplicating one breaks nothing claimed here. Recursion is what makes that test
usable a plain object *holding* an entity being itself live.

F-Import uses the reference test anyway as a deliberate over-approximation.
An imported binding is nearly always an entity and one `typeof` is cheaper
than a recursive walk of every resolved import. The cost is coverage rather
than correctness (F-Direction): a file capturing only plain data from an
import falls back where it need not. Whether to narrow F-Import to the entity
test is a question for measurement since it changes which files fold.

F-CallLeak uses the entity test and has to. A parameter helper returning
computed plain data must taint nothing and under the reference test every
one of them would be a taint source.

**F-Capture.** `f` *captures* `g`, written `f ⇝ g`, iff `w(f) = fold` and some
value in `X(f)` is a **non-primitive** obtained from `X(g)`, a `Declarable`, a
`CompositeInstance`, or any other object reached through `f`'s resolved
imports of `g`. Recorded as `g ∈ L(f)`. A primitive is never a capture: it
has no identity to disagree about (L8.5). The test here is F-Identity's
reference test, so the relation is an over-approximation of the entity
relation the proposition needs.

**F-CallLeak.** Let `φ` be a project-local function defined in `g` and called
from `f` during `f`'s fold. If the call **returns** a value that carries a live
object *which was not already carried in by the arguments*, then the
call leaked `g`'s identity into `f`: `leakedIdentity(φ)` is set and `g ∈ L(f)`
(L5.9). The test here is F-Identity's entity test. A function returning only
plain data never leaks, which is what keeps a parameter helper from tainting
anything. F-CallLeak is F-Capture through
invocation rather than through import; the edge it records is the same edge.

**F-Memo.** Within one build, `w`, `X` and `L` are computed **at most once per
file**, and every reference to `X(g)` from any `f` resolves to the same
objects (`FoldSession.cache`, L8.11). Without this, F-Capture would record an
edge to a *copy*, and the judgment would be vacuous.

**F-Count.** Within one file, a composite call reached through several member
accesses or destructured names is invoked once, and a same-file construction
bound to a `const` is built once in source order; every reference reads the
same object (L8.12, L3.8). F-Memo across files, F-Count within one.

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

**F-Succ.** `Succ(f)` is the set of files `f` taints. Read carefully, taint
flows from a tainted file `f` in two directions at once:

- *forward along imports*, to every `g` that `f` imports (`f → g`). If `f`
  runs, its real import of `g` will construct `g`'s entities; a folded `g`
  would be a second copy. So `g` runs too, even if `w(g) = fold`.
- *backward along captures*, to every `c` that captured `f`'s objects
  (`c ⇝ f`). If `f` runs, the instance `c` captured during its fold is no
  longer the instance the build collects; `c`'s folded result is stale. So `c`
  runs too, and re-obtains everything through real imports.

**F-Taint.** `T(B)` is the least set containing `Seed(B)` and closed under
`Succ`.

**F-Verdict.** A file's final verdict is `fold` iff it is not in `T(B)`.

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
one object, and every reference to `e`, from a folded file's `X`, from a run
file's import, from an `AttrRef`, is that object.

**Lemma (capture implies import).** `f ⇝ g` implies `f → g`. F-Capture
requires the captured value be reached through `f`'s resolved imports of `g`.
F-CallLeak records the same edge for a function `f` imported from `g`. A
re-export chain decomposes rather than escaping this. Where `h` re-exports
from `g` the re-export arm of F-Declarator records `h ⇝ g` alongside `h → g`,
and `f` importing that binding from `h` records `f ⇝ h` alongside `f → h`.
The closure composes the two.

The fixpoint and this proposition are checked over every build of four files
by `spec/taint-model.test.ts` (#179). That is 8,503,056 builds: every import
relation excluding self-imports, every capture relation inside it, and every
assignment of tentative verdicts. The scope is stated for the same reason
F-Depth's bounds are. The check carries its own vacuity guards. One of them is
the instance case 2 of the sketch below originally got wrong.

*Sketch.* Let `e` be produced by file `g` and let `f` be any file referring
to `e`.

1. If `g ∉ T(B)` then `g` folded and `e` is the object in `X(g)`, unique by
   F-Memo and F-Count. Suppose `f` folded. It obtained `e` through its
   resolved imports of `g` and therefore `f ⇝ g`. Were `f ∈ T(B)` the lemma
   would give `f → g` and the forward edge would put `g ∈ T(B)`. So
   `f ∉ T(B)` and its reference is the F-Memo object. Suppose instead `f`
   runs. Then `f ∈ T(B)` and `f → g`, and the forward edge puts `g ∈ T(B)`
   again. Every referrer therefore folded and holds the one object.
2. If `g ∈ T(B)` then `g` runs and `e` is constructed by real execution. `f`
   holds `e` through a binding imported from `g` or from a file that
   re-exports it. Let `g'` be the first file on that chain whose verdict is
   `run`. That is `g` itself for a direct import and is reached by the
   backward edge otherwise. J2 resolves a binding from `g'` only where `g'`
   folds. F-Import leaves it unresolved and records `g'`'s reason against it.
   A reference to it is then F-Reference's located rejection and `f`'s own
   tentative verdict is `run`. That puts `f` in `Seed(B)` on its own account
   rather than by any edge. Its import of `g'` is the run path's own module
   instance, one per file, by the host module system (or the single bundle
   under isolation). A file that imports `g'` without referencing the binding
   folds (L5.15). It holds no entity of `g`'s and is therefore not a referrer
   of `e`. Where `f ⇝ g` was recorded before `g` was tainted, the backward
   edge puts `f ∈ T(B)` and its folded capture is discarded.

No entity therefore has both a folded and a run object alive. ∎

The sketch relies on two things outside this judgment: F-Memo/F-Count (the
implementation's session and per-node memos) and the run path's own
one-instance-per-module guarantee. The second is why isolation bundles every
run-fallback file into **one** module graph rather than one per file:
two bundles would be two module instances of a shared import and the
proposition would fail on the run side.

### Consequences

**Leaf fixes buy nothing while an importer still runs.** Because taint flows
forward into imports a perfectly foldable leaf imported by a running file
runs. This was observed empirically before it was understood (chant#1107:
coverage fell after a leaf was made foldable) and is a direct corollary of
F-Succ. An implementation must not "optimise" it away; it is the soundness
condition.

**A folded file can still be forced to run by a file it never imports.** The
backward edge means `c`'s verdict depends on the verdict of a file `c` only
*captured from*. Nothing in `c`'s own source predicts it. Fallback reporting
 must therefore be able to say "forced to run because `f` runs and you
captured its objects" rather than merely quote a construct in `c`.

### Validation status

The differential that discharges the objective builds every non-empty corpus
entry both ways and holds the two to error parity and byte-identical output,
with a shrink-only allowlist for known divergences. A build where `T(B) = ∅`
is one in which this judgment does nothing, so the mixed entries are the ones
that test it.

The evidence has two sources.

- The corpus counted in `packages/conformance/corpus-report.md` which
  `npm run corpus` regenerates. Drift 0 and allowlist empty. Every mixed entry
  where `T(B) ≠ ∅` and both taint directions can fire agrees
  fold-versus-run.
- `examples/fold-adversarial/`. Nine files named for resolution-time decision
  points. Each carries this specification's inventory row and rule identifier.
  The entry's own test asserts which file folds and which runs and the
  differential holds fold-versus-run across it.

Four of the nine exercise this judgment on purpose, in one build:

- `taint-run-only-importer.ts`, F-Seed. An early `return` in a project-local
  function puts the importer in the seed.
- `taint-shared-config.ts`, F-Succ forward. The running importer pulls a
  foldable config back.
- `taint-capturing-sibling.ts`, F-Succ backward. The source of a captured
  object pulls the capturer back.
- `taint-independent.ts`, F-Taint/F-Fix. The control that no edge reaches and
  that must still fold.

The other five cover the `?.` short-circuit under F-Div-Nullish, plus
F-Eval-Ident shadowing, F-Div-SpreadType and F-Depth.

The incidental mixed entries and the one designed to fire both taint
directions all agree. The corpus is still chant's own and the adversarial entry is one
build so this is evidence rather than proof.
