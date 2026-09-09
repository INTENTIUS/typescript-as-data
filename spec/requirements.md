# Folding: specification requirements

What a specification of folding must define, derived from the mechanism as
implemented in chant core at `e4074c17` (2026-09-09).

This document is not the specification. It is the list of things the
specification has to pin down, with the reason each one is load-bearing and a
pointer to where the current implementation settles it. It exists so that the
spec can be written against the mechanism rather than against the prose that
currently describes it, which has drifted at least once (INTENTIUS/chant#2306).

Scope is chant core: `packages/core/src/fold/{subset,fold,foldable-helpers}.ts`
and `packages/core/src/discovery/fold-import.ts`. Nothing about consuming
applications, and nothing about how much existing source happens to fall inside
the subset — that is an adoption measurement, not a property of the mechanism.

## The objective the requirements serve

**Folding a file and running it are observationally equivalent.**

A source file may be reduced directly from its AST to the entities it declares,
or imported and executed, and the build cannot tell which happened from the
output. In chant this is discharged by a differential over the example corpus
asserting byte-identical serialized output for every file that folds
(INTENTIUS/chant#1025).

Equivalence is what makes the fallback safe, and the fallback is what
distinguishes this from a configuration language that rejects out-of-subset
source outright. The five requirements below are the parts of the mechanism
that equivalence rests on. A specification that states the objective without
pinning all five does not constrain an implementation enough to inherit it.

---

## R1 — The value domain is closed, and its symbolic cases are finished values

The spec must define what a fold produces. Every other requirement quantifies
over it, and it is currently defined only by a TypeScript union type
(`FoldedValue`, `fold.ts:116`).

Nine cases. Six are ordinary JSON — string, number, boolean, null, undefined,
arrays and plain objects. The rest carry structure that the specification has to
treat as **finished values, not deferred computation**:

| Case | Envelope key | Denotes |
|---|---|---|
| `AttrRefValue` | `__attrRef` | an attribute of another entity, resolved by the platform at apply |
| `FoldedIntrinsicTag` | `__intrinsic` | a registered intrinsic in tagged-template form |
| `FoldedIntrinsicCall` | `__intrinsic` | a registered intrinsic in call form, per-intrinsic opt-in |
| `FoldedHelperCall` | `__helper` | a call to a registered authoring helper |
| `FoldedResource` | `__resource` | a construction, including one nested as a value |
| `FoldedCompositeStepCall` | `__compositeStep` | the `<Identifier>(...).step` idiom, member name fixed |
| `SymbolicValue` | `__symbol` | source text preserved verbatim inside an intrinsic's interpolations |

### R1.1 — Symbolic is not unevaluated

An `__attrRef` is not a thunk. It is the same envelope
`AttrRef.prototype.toJSON()` produces at runtime, and the serializer already
accepts a plain envelope without requiring a live instance. A specification that
describes these as "unevaluated" invites an implementation that tries to force
them, which is precisely wrong: there is nothing to force, and the value they
denote does not exist at build time in either path.

### R1.2 — Envelopes are an internal representation and must not escape

`__resource` in particular must never reach a serializer; it is consumed by
revival (R2) and replaced by a real instance. The spec must say which envelopes
are internal to the fold-then-revive pipeline and which are legitimate output.
`__attrRef` and `__intrinsic` are output. `__resource`, `__helper` and
`__compositeStep` are not.

### R1.3 — Callables are in the domain but are not values

`FoldableFunction` (`fold.ts:378`) lets a call to a project-local function fold,
by binding folded arguments and folding the callee's body. But a function cannot
be serialized, so `{ resolver: myFn }` must not fold even though `myFn(x)` does.

The specification must therefore define a **serializable sub-domain** and say
which positions require it. This is not a quality-of-implementation detail; it
is the difference between a spec that admits a coherent implementation and one
that does not.

### R1.4 — Liveness is observable and the spec must say so

The implementation distinguishes folded data from a live instance by testing for
a prototype other than `Object`/`Array` (`fold.ts:411`). That test is what makes
the identity rules in R5 statable at all — without a definition of "this value is
a live entity rather than plain data," there is nothing for identity to be a
property of.

---

## R2 — Folding executes none of the folded file's own statements, and the spec must say exactly that

The claim is narrower than "no execution", and stating it loosely is the single
easiest way to write a specification that is either false or useless.

**What is guaranteed:** none of the top-level statements of the file being folded
are executed. That is the whole of the guarantee, and it is what makes the build
independent of module side effects.

**What still executes:** revival. A `__resource` envelope names a constructor;
the bridge reads the folding file's own `import` declarations to learn which
module that name came from, imports *that* module, and calls the real class with
the folded arguments. Same for `__intrinsic`, `__helper` and `__compositeStep`.
The implementation is explicit that this is not a regression, on the grounds
that the run path imports the same module to obtain the same class, and the only
thing skipped is the file's own statements (`fold-import.ts` module doc).

This two-phase shape — **fold to envelopes with zero execution, then revive by
resolving names through the folding file's imports** — is the mechanism's actual
architecture and no current prose states it plainly. A specification that omits
it will be read as claiming nothing executes, which is false, and an implementer
who believes it cannot build a working folder.

### R2.1 — Trust is decided by resolution, never by the text of a specifier

A name is admitted for revival because it resolves to a module the build already
trusts, not because it looks trusted. `isChantOwnedSpecifier`
(`foldable-helpers.ts:247`) and the lexicon-package set are resolution checks;
a specifier that merely reads as `@intentius/chant-lexicon-anything` is not
sufficient, because an untrusted repository controls both its own source text
and the contents of its own `node_modules`.

### R2.2 — Isolation changes what folds, so it is part of the mechanism

Under sandboxed execution a fold whose revival would invoke *project-owned* code
is refused, and the file falls back to run instead (INTENTIUS/chant#1093). The
fold/run decision is therefore not a pure function of the source: it is
parameterized by whether project code may be executed in this process. Either
the spec models that parameter or it describes a judgment that behaves
differently in a real deployment. See #36.

### R2.3 — One admitted call shape evaluates eagerly rather than enveloping

A lexicon function registered with `intrinsicCallFoldsEagerly` is evaluated at
fold time rather than deferred to revival, because its ordinary use coerces the
result to string during folding, before any revival would run
(INTENTIUS/chant#1966). The spec needs this as a stated exception, not as an
implementation quirk, because it is a place where fold time and revival time are
observably different.

---

## R3 — Membership is decided once, by a classifier permitted to err in one direction only

The subset must have exactly one definition. In chant that is
`findSubsetViolation` (`subset.ts:289`), shared by the folder and by the lint
rules EVL001/EVL003 so the linted subset and the folded subset cannot drift.

### R3.1 — The direction is the requirement, not the agreement

The two consumers do not have the same information. A lint pass has no binding
resolver and no lexicon registry; the folder has both. So they will disagree, and
the specification's job is to constrain *how*: the shape-only classifier may
accept what the resolving evaluator rejects, and must never reject what it
accepts.

The enumerated divergences, all in that safe direction: identifier resolution,
tagged-template tag registration, authoring-helper provenance, spread-source
runtime type, and a bare identifier bound to a same-file construction.

### R3.2 — The two exceptions must be stated, not tidied away

Two cases run the other way and a specification that claims a clean
one-directional property is weaker than one that names them:

1. **Short-circuit laziness.** The folder evaluates `&&`, `||`, `??` and the
   conditional lazily, so an unfoldable untaken branch does not reject. The
   shape classifier has no notion of "taken" and requires every branch to be
   valid. The implementation's own module doc calls this a wart.
2. **Intrinsic call-form registration.** The classifier takes the registry as an
   optional parameter — exact with one, conservatively rejecting without. An
   implementation that omits it is systematically wrong in the expensive
   direction. The parameter exists so a downstream tool can ask "will this fold?"
   without running a fold.

### R3.3 — A call is structurally unrepresentable, with an enumerated set of exceptions

The general rule is that a function call as a value has no evaluation case at
all — it is not forbidden by a rule, it is absent from the mechanism. The spec
must then enumerate the exceptions exhaustively, because each one is a hole
deliberately cut:

- a registered authoring helper, by name **and** import provenance;
- a lexicon intrinsic whose lexicon opted its call form in, per intrinsic;
- a project-local function whose body is itself in the subset;
- an eagerly-evaluated lexicon function (R2.3);
- a method call whose receiver folds to a real value and is not one of the
  folder's own symbolic envelopes.

Two of these are closed allowlists of names a human wrote down. One is open but
local. One is a receiver-type condition. The specification must say which kind
each is, because "the callee is admitted" and "the receiver is admitted" are
different admissibility rules and an implementer will conflate them.

---

## R4 — The decision is per file, total, and closed under a bidirectional fixpoint

### R4.1 — All or nothing, per file

A file folds entirely or runs entirely. There is no partial fold, and a fallback
is a normal outcome rather than an error (`FoldFileResult`,
`fold-import.ts:104`, whose failure case carries a reason rather than throwing).

### R4.2 — Contagion runs in both directions

This is the requirement most likely to be missed, and the one that makes
per-file partial evaluation sound in the presence of object identity.
`planFoldTaint` (`fold-import.ts:3890`) computes it:

- **Forward.** A file that imports or re-exports from a file that will not fold
  is itself tainted. Otherwise its real import of that module and the module's
  own folded copy would be two different objects.
- **Reverse.** A file whose *objects were captured* by an already-folded file
  taints that consumer. If the source is forced back to run, the instance the
  consumer captured is no longer the instance discovery collects, and
  serialization fails on an entity with no logical name.

The reverse edges are built from `liveSources`, which records only non-primitive
values — a string has no identity to disagree about.

### R4.3 — The fixpoint and its termination

Seed the tainted set with every file that would not fold on its own, then walk
the union of forward and reverse edges to closure. Monotone over a finite file
set, so it terminates. The spec should state it as a least fixpoint rather than
describe the worklist, so an implementation is free to compute it differently.

### R4.4 — Cycles are a located error, not divergence

A genuine reference cycle is detected and reported with the cycle path, rather
than recursing forever or awaiting a promise that never settles
(`FoldSession.stack`, `fold-import.ts:167`).

---

## R5 — A cross-file entity has exactly one instance per build

Every referrer of a folded file must observe the same objects. In chant a
per-build session memoizes each file's fold so a file imported by several others
is folded exactly once, and every referrer resolves against the same result and
therefore the same constructed instances (`FoldSession`, `fold-import.ts:167`).

### R5.1 — The exported namespace must be complete, not filtered

A successful fold yields every exported name's resolved value, not only the
entity-valued ones — the same table the run path would obtain by importing the
module. Completeness is what makes equivalence checkable: a fold that reported a
subset would silently differ from a run.

### R5.2 — R5 is why R4.2 exists

The reverse taint edge is not defensive programming. It is the consequence of
this requirement: single-instance-per-build cannot hold if one side of a sharing
relationship folds while the other runs. A specification that states R5 without
R4.2 has stated a property it cannot maintain.

---

## Requirements on the specification itself

Four, and they are cheap to satisfy if adopted early and expensive to retrofit.

1. **Every normative rule carries a stable identifier**, so an implementation
   can cite what it implements and a conformance fixture can cite what it tests.
2. **Every identifier is exercised by at least one fixture, and every fixture
   cites a real identifier.** Both directions, in CI. The first stops the spec
   growing rules nothing checks; the second stops fixtures citing renamed rules.
3. **Rejections are located.** An implementation must be able to name the node
   that caused a rejection and the rule it violated, without the spec
   constraining message wording. Anything weaker admits a conforming
   implementation that answers "no" to everything.
4. **The subset is versioned.** It has moved repeatedly — cross-file resolution,
   lexicon package exports, nested constructions, intrinsic call forms,
   project-local calls — and each move changed what conforming source could
   contain.

---

## What this list is not

It is not a claim that the current implementation is correct, and it is not a
transcription of it. Where the implementation settles a question by accident
rather than by decision, the specification should say so and decide. Three known
places: the laziness divergence in R3.2, which the implementation itself calls a
wart; the `.step` narrowing in R1, which is deliberately one idiom wide and has
no principled boundary; and the eager-evaluation exception in R2.3, which exists
because of how one result is coerced rather than because eagerness is right.
