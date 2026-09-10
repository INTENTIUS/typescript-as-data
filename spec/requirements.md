# Folding: specification requirements

What a specification of folding must define, derived from chant core's fold
mechanism at `e4074c17` (2026-09-09). Second revision (#41); the first was
derived from a partial read and its holes are recorded in
[`inventory.md`](./inventory.md) and closed here.

This document is not the specification. It is the list of things the
specification has to pin down, with the reason each is load-bearing and the
inventory row that settles it in the current implementation. Rows are cited
as `L3.10`; the inventory is the coverage ledger and #44 gates on it.

Scope is chant core: `packages/core/src/fold/{subset,fold,foldable-helpers}.ts`
and `packages/core/src/discovery/fold-import.ts`. Nothing about consuming
applications, and nothing about how much existing source happens to fall inside
the subset — that is adoption, not mechanism.

Not normative. Identifiers here (`R1.2`) are provisional pending #46; the
normative text will carry `S-*`/`F-*` rule identifiers per #6.

## The objective the requirements serve

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
a literal supplied at build invocation (R8), so output is a function of source
*and* binding; "same source, same output" is true only with the binding held
fixed.

Equivalence is what makes the fallback safe, and the fallback is what
distinguishes this from a configuration language that rejects out-of-subset
source. But — per [`prior-art.md`](./prior-art.md) — graceful fallback is not
itself new. What is new is that the fallback coexists with shared object
identity across the fold/run boundary, which is why R4 and R5 exist.

---

## R1 — The value domain is closed, and its symbolic cases are finished values

The spec must define what a fold produces. Every other requirement quantifies
over it, and it is currently defined only by a TypeScript union
(`FoldedValue`, `fold.ts:116`; L4.1).

Nine cases. Six are ordinary JSON — string, number, boolean, null, undefined,
arrays and plain objects. The rest carry envelopes:

| Case | Envelope key | Denotes | Fate (R1.2) |
|---|---|---|---|
| `AttrRefValue` | `__attrRef` | an attribute of another entity, resolved at apply | survives |
| `FoldedIntrinsicTag` | `__intrinsic` | registered intrinsic, tagged-template form | revived |
| `FoldedIntrinsicCall` | `__intrinsic` | registered intrinsic, call form | revived |
| `FoldedHelperCall` | `__helper` | registered authoring helper call | revived |
| `FoldedResource` | `__resource` | a construction, top-level or nested as a value | revived |
| `FoldedCompositeStepCall` | `__compositeStep` | `<Identifier>(...).step`, member fixed | revived |
| `SymbolicValue` | `__symbol` | source text preserved inside an intrinsic interior | revived |

### R1.1 — Symbolic is not unevaluated

An `__attrRef` is not a thunk. It is the envelope `AttrRef.prototype.toJSON()`
produces at runtime, and the serializer accepts it without a live instance. A
specification that describes these as "unevaluated" invites an implementation
that tries to force them, which is precisely wrong: the denoted value does not
exist at build time in either path.

### R1.2 — Exactly one envelope survives to serialization, and its validity is position-dependent

This corrects the first revision, which had it backwards.

`reviveFoldedValue` (L6.1–L6.9) resolves every envelope *except* `__attrRef`
through the folding file's own imports and invokes the real function or
constructor: `__intrinsic` in both forms (L6.3), `__helper` (L6.4),
`__compositeStep` (L6.5), `__resource` (L6.6), `__symbol` via a dotted-chain
regex (L6.2). None of those may reach a serializer.

`__attrRef` passes through unrevived (L6.7) — **except** inside an intrinsic's
or authoring helper's arguments, where it is rejected (L6.8, `requireLiveRefs`)
because the receiver performs `instanceof` checks and `WeakRef` derefs and a
look-alike plain object would produce wrong output rather than absent output.
Composite-step arguments revive with `requireLiveRefs: false` because a
composite stores its props rather than inspecting them (L6.9).

So the spec must say: the same value is valid in one position and invalid in
another, and which positions are which. A domain definition alone does not
capture this.

### R1.3 — Callables are in the domain but are not values

`FoldableFunction` (L4.4) lets a call to a project-local function fold, and is
explicitly *not* a `FoldedValue`: it never appears inside a folded tree. A
function used as a value is refused (L3.1), a `FoldableFunction` reached as a
bare identifier is refused, and an eagerly-evaluated lexicon function
referenced without calling it is refused with "call it instead" (L3.17).

The specification must therefore define a **serializable sub-domain** and say
which positions require it.

### R1.4 — Liveness is observable and the spec must say so

`carriesLiveObject` (L4.5) distinguishes folded data from a live instance by
prototype — anything other than `Object`/`Array`/`null` — and additionally
treats `typeof value === "function"` as live. That predicate is what makes the
identity rules in R4 and R5 statable: without a definition of "this value is a
live entity rather than plain data," there is nothing for identity to be a
property of.

### R1.5 — Constructor arity is contractual

`FoldedResource.args` (L4.2) is present when the argument list is not the
classic `(props)` / `(props, attributes)` shape, and is then authoritative:
the entity is constructed by spreading it. `props` is a view. The
`undefined` case in the union (L4.3) has no rule today. Both are #42's.

---

## R2 — Folding executes none of the folded file's own statements, and the spec must say exactly that

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

### R2.1 — Trust is decided by resolution, never by the text of a specifier

Two arms (L9.1–L9.4). Arm 1: an active lexicon package of *this build*,
matched by text against a closed set built from names the build already
resolved — and its subpaths, by extracting the package root from the specifier
text (L9.2). Arm 2: the specifier is *resolved* and the resulting path checked
against chant-core's own tree; text is explicitly insufficient because an
untrusted repository controls both its source and its `node_modules`.

A build that supplies no lexicon list keeps only arm 2 — disabled, not loosened
(L9.4). One documented, accepted unsoundness: the bare-specifier resolution
cache is process-wide and assumes no nested `node_modules` version override
(L9.6); the spec should state it as an assumption rather than inherit it
silently.

### R2.2 — Isolation changes what folds, so it is part of the mechanism

Under sandboxed execution a fold whose revival would invoke *project-owned*
code is refused and the file falls back to run (L9.5,
INTENTIUS/chant#1093). The fold/run decision is therefore parameterized by
whether project code may execute in this process. Either the spec models that
parameter or it describes a judgment that behaves differently in a real
deployment. See #36.

### R2.3 — The observable

`FoldExecutionCounts` (L10.1) — `factoryInvocations`,
`projectFactoryInvocations`, `factoryInterpretations` — is how this
requirement is checked rather than trusted. #43 decides what a conforming
implementation must expose.

---

## R3 — Membership is decided once, by a classifier permitted to err in one direction only

The subset has exactly one definition: `findSubsetViolation` (`subset.ts:289`),
shared by the folder and by the lint rules EVL001/EVL003 so the linted subset
and the folded subset cannot drift (L2.*).

### R3.1 — The direction is the requirement, not the agreement

The two consumers have different information. A lint pass has no binding
resolver and no lexicon registry; the folder has both. The shape-only
classifier may accept what the resolving evaluator rejects, and must never
reject what it accepts. Enumerated divergences in that direction: identifier
resolution (L2.3), tag registration (L2.4), helper provenance (L2.11),
spread-source runtime type (L3.4, L3.5), a bare identifier bound to a
same-file construction (L3.8).

### R3.2 — The two exceptions must be stated, not tidied away

1. **Short-circuit laziness** (L2.9, L3.13). The folder evaluates `&&`, `||`,
   `??` and the conditional lazily; the classifier requires every branch to be
   valid. The implementation's own module doc calls this a wart.
2. **Intrinsic call-form registration** (L2.12). The classifier takes the
   registry as an optional parameter — exact with one, conservatively rejecting
   without. The parameter exists so a downstream tool can ask "will this fold?"
   without running a fold.

### R3.3 — A call is structurally unrepresentable, with an enumerated set of exceptions

A function call as a value has no evaluation case — it is absent from the
mechanism, not forbidden by a rule (L2.16). The spec must enumerate the
exceptions exhaustively, and say which *kind* each is:

| Exception | Kind | Rows |
|---|---|---|
| registered authoring helper | closed allowlist, name **and** import provenance | L2.11 |
| lexicon intrinsic, call form opted in | closed allowlist, per intrinsic | L2.12 |
| project-local function with a foldable body | open, local | L5.4 |
| eagerly-evaluated lexicon function | closed allowlist, evaluates at fold time | L2.13, R7.3 |
| method call on a real receiver | receiver-type condition, method never checked by name | L2.14, L3.18, L3.19 |
| `<Identifier>(...).step` | one idiom, member fixed, callee must be unclaimed | L2.15, L3.20 |

"The callee is admitted" and "the receiver is admitted" are different
admissibility rules and an implementer will conflate them.

---

## R4 — The decision is per file, total, and closed under a bidirectional fixpoint

### R4.1 — All or nothing, per file — at the normative entry point

Two entry points exist and the first revision conflated them. `tryFoldFile`
returns a `FoldFileResult` (L8.1): ok with the complete export namespace, or a
reason. One unrecognized export disqualifies the file (L8.2). `foldModule`
(L8.3) is per-export, carries an ok/false entry per declaration, and silently
skips non-`new` exports. **The per-file entry point is normative**; the
per-export one is a diagnostic surface, and the spec must say so.

The reason fallback is per-module rather than per-declaration is stated in the
statement gate itself (L1.7) and belongs in the spec: an unfoldable export can
reference or be referenced by a foldable one in ways only running proves safe.

### R4.2 — Contagion runs in both directions, and through calls

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

### R4.3 — The fixpoint and its termination

Seed with every file that would not fold on its own; walk the union of forward
and reverse edges to closure. Monotone over a finite file set, so it
terminates. State it as a least fixpoint, not as the worklist.

### R4.4 — Cycles are a located error, not divergence

`FoldSession.stack` (L8.9) detects a genuine reference cycle and reports the
path.

### R4.5 — Three depth bounds, all of which decide fold versus run

`MAX_FUNCTION_CALL_DEPTH = 32` (L5.8), `MAX_INTERPRETATION_DEPTH` (L7.8),
`MAX_RESOLUTION_DEPTH` (L8.10). Each terminates a different recursion and each
turns exhaustion into a fallback. No requirement in the first revision
mentioned them. The spec must either fix the bounds or say they are
implementation-defined and that exceeding one is a fallback, never wrong
output.

### R4.6 — Evaluation count is observable semantics

A composite call reached through several member accesses or destructured names
is invoked **exactly once** (L8.12, `ResolveCtx.memo`), explicitly "matching
what actually running the file would do." A named same-file construction is
built once, in source order, and every reference reads the same object (L3.8).
These are not optimizations; an implementation that invoked twice would produce
two entities where running produces one.

---

## R5 — A cross-file entity has exactly one instance per build

Every referrer of a folded file must observe the same objects. A per-build
session memoizes each file's fold so a file imported by many is folded exactly
once (L8.11), and revival passes live objects through unchanged rather than
reconstructing them (L6.1) — the generic walk would destroy the identity it
exists to preserve.

### R5.1 — The exported namespace is complete, and the statement gate is why

A successful fold yields every exported name's value, not only the
entity-valued ones (L8.4). This holds *because* the statement gate (R6.1)
disqualifies any file with an unrecognized export. The first revision stated
the property without its enforcement.

### R5.2 — R5 is why R4.2 exists

The reverse and through-call taint edges are the consequence of this
requirement: single-instance-per-build cannot hold if one side of a sharing
relationship folds while the other runs.

---

## R6 — Admissibility is decided at two layers, and is scope-dependent

The first revision specified only the expression layer.

### R6.1 — The statement gate runs first and disqualifies whole files

`scanExports` (L1.1–L1.6) recognizes exactly: `export const X = new Type(...)`,
`export const X = <expr>`, `export const {a, b} = <expr>`, `export {a, b}`,
`export {a, b} from "./m"`, and `export function f() {}`. Anything else
disqualifies the file: `export default`, `export * from`, an exported class,
`let`/`var`, a destructured export with a rest, nested or defaulted element.
`export type {...}` and type-only re-export elements are erased, not
disqualifiers (L1.6).

### R6.2 — The expression layer is R3's subject and #12's grammar

Every expression reachable from an admitted statement is classified by R3's
single definition. The admissible forms — literals, templates with spans,
object members with literal keys, element access with literal keys, the
operator sets, positional `new` arguments — are enumerated by the grammar
(#12), not here. Inventory rows L2.1, L2.2, L2.5–L2.8, L2.10 remain GAP until
#12 lands.

### R6.3 — Admissibility depends on where the expression sits

Five constructs that fold at a file's top level are refused inside a folded
function body: `new`, a tagged template, a helper call, an intrinsic call, and
`.step` (L3.16, `functionBodyDepth`). Each produces an envelope revived against
the *caller's* imports, which is not the scope the body was written in.
`new ns.Type(...)` is refused everywhere: a namespace-qualified constructor
cannot be resolved through named imports (L3.15).

### R6.4 — Shadowing

`consts` is consulted before `externals` (L5.3). A local `const` defeats a
registered helper or intrinsic name — the file's own binding wins, so a local
`Ref` is not the lexicon's. A parameter or body binding shadows a module-level
const of the same name.

### R6.5 — Two further statement-level subsets, and an asymmetry between them

A **project-local function** is admissible (L5.4) when its parameters bind
plainly, its body is a single expression or `const` declarations followed by
one `return`, and it is not a generator, async, rest-parameter, early-return,
or `let`/`var` function. Parameter defaults fold in the callee's scope (L5.6).
A block body with no `return` evaluates to `undefined` (L5.7).

A **composite factory** is admissible (R7.2) under rules 3–5 of the same
shape — except that its body **must** end in `return` and an empty body is
rejected (L7.4). The two subsets differ on exactly this point and the spec
should say why, or fix one.

### R6.6 — What a binding is, and the order names resolve in

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

## R7 — There are three evaluation modes, not two

The first revision described fold-to-envelope and revival. There is a third,
and it is the one that makes folding under isolation possible.

### R7.1 — Envelope, then revive

The default for everything R1's table marks *revived*: `fold()` executes
nothing and records what was named; the bridge resolves the name through the
folding file's imports and invokes it (R1.2, R2).

### R7.2 — Interpret, never importing the defining module

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

### R7.3 — Evaluate eagerly

A lexicon function registered with `intrinsicCallFoldsEagerly` (L2.13) is
called at fold time with folded arguments rather than enveloped, because its
ordinary use coerces the result to string during folding, before any revival
would run. A method call on a real receiver (L2.14) is the same mode: the
receiver is the same object either way, so calling it is what running would
do. Both are places where fold time and revival time are observably different,
and the spec must name them as such.

---

## R8 — Build parameters are an input to folding

`FoldSession.buildParams` (L5.11) is consulted for exactly one bare specifier:
a named `params` import resolving to chant's `params` module. `params.<name>`
folds to a literal. A bare `process` reference is refused with a message naming
this mechanism as the alternative (L3.7). The `params` object is tracked by
identity like an entity (`fold-import.ts:3141`).

The objective is stated pointwise at a binding because of this requirement. An
implementation without build parameters satisfies it trivially; one with them
must say how the binding enters and that it is recorded.

---

## R9 — Outputs beyond values, and what must be observable

Folding produces more than the value tree, and the first revision had no place
for any of it. Four things, each decided here as a recommendation for the
normative text (#43).

### R9.1 — Provenance is an optional capability, outside the equivalence objective

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

### R9.2 — The no-execution observable is normative in shape, not in name

R2 is checkable only through `FoldExecutionCounts` (L10.1). A conforming
implementation must expose, per build and resettable: the number of factory or
constructor invocations performed in-process during folding; of those, how
many resolved to project-owned code; and how many factory bodies were
interpreted instead. Three non-negative integers. That is sufficient for a
conformance harness to assert "zero project-owned invocations" under isolation
(R2.2) and to measure interpretation coverage (R7.2). Names are not normative.

### R9.3 — Fallback reporting is normative

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

### R9.4 — Message stability is not normative; location and rule are

chant builds every rejection message of a given kind through one shared
builder so two sites cannot drift (L10.5). That is a property of one
implementation's tooling: a second implementation in another language cannot
share strings, and requiring it would make the wording normative by the back
door. What conformance requires is already R-spec.3 — the node and the rule
identifier — and `FoldError` carries exactly those (L10.4).

---

## R10 — Semantics a second implementation cannot guess

R1 defines the domain and R3 defines membership. Neither says what an operator
*means*. "As ECMAScript" is the obvious discharge and it is available for most
of this section — but not all of it, and the places where the implementation
departs from ECMAScript are exactly the ones a second implementation would get
wrong by assuming it.

### R10.1 — Operators are ECMAScript's, on the folded operand values

The supported binary operators (L2.8, L3.14): `+` `-` `*` `/` `===` `!==` `>`
`<` `>=` `<=`, and the lazy `&&` `||` `??` (L3.13). Unary `!` and `-`
(L3.12). Conditional `?:`. For every one of these the implementation applies
the host JavaScript operator to the folded values, so the semantics — including
`+`'s string-versus-numeric dispatch, relational comparison on strings, and
`&&`/`||` returning an operand rather than a boolean — are ECMAScript's. The
spec should say so per operator and require an implementation in another
language to reproduce ECMAScript coercion for these operators, not its host's.

### R10.2 — Member access on `null`/`undefined` is *not* ECMAScript, and the spec must pick

Both access branches return `undefined` where ECMAScript throws (L3.10,
INTENTIUS/chant#2328). Two defensible rules: refuse and fall back, matching
what chant#1535 chose for the sibling case; or keep optional-chaining
semantics and state that fold is not equivalent to run for this shape. The
spec must state one. Until chant resolves #2328, "as ECMAScript" is not
available for member access.

### R10.3 — Attribute references are produced by two rules and refused by a third

Property or element access on an identifier bound to a same-file `new` yields
`{__attrRef: {entity, attribute}}` keyed by the identifier (L3.9). Access on a
value that folded to a `{__resource}` envelope yields the same, but only when
the object expression is a plain identifier — any other shape is refused,
because there is no name to key the reference on and silently indexing the
envelope produced wrong output (L3.11, chant#1535).

### R10.4 — Template spans coerce by ECMAScript `ToString`, and the spec must say what that does to an envelope

`String(fold(span))` (L3.2). For scalars that is ECMAScript. For a symbolic
envelope it is `"[object Object]"` — and, verified, the run path produces the
same, because `AttrRef` defines no `toString`. So fold and run *agree* and the
output is silently wrong on both; the implementation guards the
eager-intrinsic case for exactly this hazard (R7.3) and not the template span.
The spec should refuse an envelope in a plain template span rather than
inherit `ToString`; chant's side of it is tracked as a lint gap.

### R10.5 — Key and element ordering are ECMAScript's, and byte-identity depends on it

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

### R10.6 — Spread departs from ECMAScript in one direction

Object spread requires a non-null object; array spread requires
`Array.isArray` (L3.4, L3.5). ECMAScript array spread accepts any iterable —
`[...'ab']` is `['a','b']` there and a rejection here. A deliberate narrowing,
and one a second implementation would not infer from "as ECMAScript".

### R10.7 — `undefined` is absent, not `null`, in a property; and is `null` in an array

The domain admits `undefined` (L4.3). The serializer walker passes it through
unchanged and keeps the key (`serializer-walker.ts:33`, `:117`); the drop
happens at emission, and — verified — it happens for both formats because
YAML is produced by round-tripping the sorted JSON (`build.ts:743–746`), so
`JSON.stringify` has already removed an `undefined`-valued key and turned an
`undefined` array element into `null` before any YAML exists. That is what
makes chant's build-parameters documentation true ("dropped from the output
in both JSON and YAML rather than shipped as `null`"). Both facts must be
stated because they are the difference between "absent" and "null", which
platforms treat differently — and for the six YAML-native lexicons above the
walker's `undefined` reaches *their* emitter directly, so the rule there is
each serializer's, not `JSON.stringify`'s.

### R10.8 — Constructor arity

`FoldedResource.args` (L4.2, R1.5): present when the argument list is not
`(props)` or `(props, attributes)`, authoritative when present, the entity
constructed by spreading it; `props` is a view, never re-passed. An
implementation that assumed the props object is always first would construct
`new Parameter("String", {...})` wrongly.

---

## Requirements on the specification itself

1. **Every normative rule carries a stable identifier** (#6, #46).
2. **Every identifier is exercised by at least one fixture, and every fixture
   cites a real identifier.** Both directions, in CI (#8, #44).
3. **Rejections are located** — node and rule, wording unconstrained. Message
   stability is not normative (R9.4).
4. **The subset is versioned** (#18).

---

## Changes since the first revision

| | First revision | This revision |
|---|---|---|
| Objective | source alone | source at a fixed parameter binding (R8) |
| R1.2 | `__attrRef` and `__intrinsic` survive | only `__attrRef`; position-dependent |
| R4.1 | one entry point | two; per-file is normative |
| R4.2 | import edges only | plus through-call (`leakedIdentity`) |
| R4.5, R4.6 | absent | depth bounds; evaluation count |
| R5.1 | property only | plus its enforcement (R6.1) |
| R6 | absent | statement gate, scope-dependence, shadowing, two more subsets |
| R7 | two modes | three; interpretation's five rules |
| R8 | absent | build parameters |
| R9 | absent | provenance, the execution observable, fallback reporting, message stability |
| R10 | absent | operator, coercion, ordering, `undefined`, spread and arity semantics |
| R6.6, R9.3 | absent | binding shape, lookup order, defining-module scope, call-site relocation (#48) |

## What this list is not

It is not a claim that the implementation is correct. Where the implementation
settles a question by accident rather than decision, the specification should
decide: the laziness divergence (R3.2), the `.step` narrowing (one idiom, no
principled boundary), the eager-evaluation exception (exists because of one
coercion), the return-required asymmetry (R6.5), and the null-access behaviour
now under INTENTIUS/chant#2328.

It is also derived from a read that left two regions of `fold-import.ts`
unvisited — named at the bottom of `inventory.md` and a precondition on #44.
