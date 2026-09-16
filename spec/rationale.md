# Rationale

Non-normative. The reasoning that motivated each rule carried over from the retired `requirements.md`. Keyed by the rule(s) each note supports.

One section per rule file in the reading order of `README.md`.

---

## Grammar of the fold subset (`grammar.md`)

**S-Call** *(A call is structurally unrepresentable with an enumerated set of exceptions)*

A function call as a value has no evaluation case, it is absent from the
mechanism, not forbidden by a rule (L2.16). The spec must enumerate the
exceptions exhaustively and say which *kind* each is:

| Exception | Kind | Rows |
|---|---|---|
| registered authoring helper | closed allowlist, name **and** import provenance | L2.11 |
| lexicon intrinsic, call form opted in | closed allowlist, per intrinsic | L2.12 |
| project-local function with a foldable body | open, local; the callee's binding is visible in the file, which is S-CallLocal | L2.17, L5.4 |
| eagerly-evaluated lexicon function | closed allowlist, evaluates at fold time | L2.13, |
| method call on a real receiver | receiver-type condition, method never checked by name | L2.14, L3.18, L3.19 |
| `<Identifier>(...).step` | one idiom, member fixed, callee must be unclaimed | L2.15, L3.20 |

"The callee is admitted" and "the receiver is admitted" are different
admissibility rules and an implementer will conflate them.

---

**S-Module, S-Disqualify** *(Admissibility is decided at two layers: the statement gate runs first and disqualifies whole files)*

`scanExports` (L1.1–L1.6) recognizes exactly: `export const X = new Type(...)`,
`export const X = <expr>`, `export const {a, b} = <expr>`, `export {a, b}`,
`export {a, b} from "./m"`, and `export function f() {}`. Anything else
disqualifies the file: `export default`, `export * from`, an exported class,
`let`/`var`, a destructured export with a rest, nested or defaulted element.
`export type {...}` and type-only re-export elements are erased (L1.6).

**§2** *(The expression layer)*

Every expression reachable from an admitted statement is classified by's
single definition. The admissible forms, literals, templates with spans,
object members with literal keys, element access with literal keys, the
operator sets, positional `new` arguments, are enumerated by the grammar,
not here.

**S-FnBody, S-FactoryBody** *(Two further statement-level subsets and an asymmetry between them)*

A **project-local function** is admissible (L5.4) when its parameters bind
plainly, its body is a single expression or `const` declarations followed by
one `return`, and it is not a generator, async, rest-parameter, early-return,
or `let`/`var` function. Parameter defaults fold in the callee's scope (L5.6).

A **composite factory** is admissible under rules 3–5 of the same
shape except that its body **must** end in `return` and an empty body is
rejected (L7.4). The two subsets differ on exactly this point and the
difference is open.

---

**S-Unary, S-Binary** *(Two of the exclusions are principled and the rest are inherited)*

Thirteen binary operators and two unary ones are held as closed sets (L2.8).
`F-Host-Generality` forbids a host from varying their semantics. The
membership is therefore normative for a second implementation and the document
should say which exclusions were decided.

One principle covers three. An operator that observes a value's
*representation* rather than its value answers differently per profile. A
resource is a live instance in `full` and an envelope in `data-host`
(F-Val-Fate). `typeof`, `in` and `instanceof` are all of that kind. Admitting
one would make its answer depend on which profile ran. That is the thing
`F-Host-Generality` exists to prevent.

Two more are decided on their own terms. `==` and `!=` coerce. A subset whose
point is that a value is fixed by its source should not carry an operator
whose answer turns on a conversion the reader has to know. `delete`, `++` and
`--` mutate, and nothing in the subset has a place to put the effect.

**The rest are chant's set and have not been revisited.** No principle here
admits `*` and `/` while excluding `%` and `**`. Those are the same arithmetic
over the same folded numbers under the same ECMAScript semantics. The bitwise
operators are the same again. Their absence is inherited from
`SUPPORTED_BINARY_OPERATORS` rather than argued. Adding one would be a widening
and would move the minor. Nothing in the design is waiting on it.

---

## Judgments (`judgments.md`)

**F-NoOwnExecution** *(Folding executes none of the folded file's own statements)*

The claim is narrower than "no execution" and stating it loosely is the single
easiest way to write a specification that is either false or useless.

None of the top-level statements of the file being folded are
executed. That is the whole of the guarantee.

Revival and eager evaluation still execute. A `__resource`
envelope names a constructor; the bridge reads the folding file's own `import`
declarations, imports *that* module, and calls the real class with the folded
arguments. The run path imports the
same module to obtain the same class so the only thing skipped is the file's
own statements (`fold-import.ts` module doc).

**F-IsolatedRefusal** *(Isolation changes what folds so it is part of the mechanism)*

Under sandboxed execution a fold whose revival would invoke *project-owned*
code is refused and the file falls back to run (L9.5,
INTENTIUS/chant#1093). The fold/run decision is therefore parameterized by
whether project code may execute in this process.

Isolation is an optional capability, modelled in the
judgment. J2 takes an isolation mode `ι ∈ {open, isolated, executing}`;
under `isolated`, a file whose fold would require invoking project-owned code
is `run`, not `fold` (F-IsolatedRefusal, judgments.md). `executing` is the
opposite opt-in, under which a declared project function whose body
cannot fold is invoked at a declarator (F-Call step 2), so the fold may
depend on the folding process. It is never the default since a fold that reads the
environment silently is what chant#2453 found. An implementation declares
which modes it supports; conformance reports them separately and requires
neither `isolated` nor `executing`. The observable is `projectFactoryInvocations`
counter which must be zero for every folded file under `isolated`. Nix
import-from-derivation is the cited precedent for evaluation escaping into a
contained execution and resuming (`prior-art.md`). The reference
implementation is not required to ship a sandbox before submission.

**F-Obs-Counters** *(The observable)*

`FoldExecutionCounts` (L10.1), `factoryInvocations`,
`projectFactoryInvocations`, `factoryInterpretations`, is how this
requirement is checked rather than trusted.

---

**J3** *(The decision is per file, total, and closed under a bidirectional fixpoint)*

**F-Total, F-Scan** *(All or nothing, per file, at the normative entry point)*

Two entry points exist. `tryFoldFile` returns a `FoldFileResult` (L8.1)
either ok with the complete export namespace or a reason. One unrecognized export disqualifies the file (L8.2). `foldModule`
(L8.3) is per-export, carries an ok/false entry per declaration, and silently
skips non-`new` exports. **The per-file entry point is normative**; the
per-export one is a diagnostic surface.

The reason fallback is per-module rather than per-declaration is stated in the
statement gate itself (L1.7) and belongs in the spec: an unfoldable export can
reference or be referenced by a foldable one in ways only running proves safe.

**F-Succ, F-Capture, F-CallLeak** *(Contagion runs in both directions and through calls)*

`planFoldTaint` (L8.6–L8.8):

- **Forward along imports.** A tainted file taints every file it imports or
  re-exports from: if `f` runs, its real import of `g` constructs `g`'s
  entities, and a folded `g` would be a second copy, so `g` runs even if it
  would have folded alone. Reading it the other way round, as an importer of a
  non-folding file being tainted, describes J2's resolution failure putting
  the importer in the seed. That happens earlier than this walk.
- **Reverse.** A file whose *objects were captured* by an already-folded file
  taints the capturer. `liveSources` records only non-primitive captures
  (L8.5) because a primitive has no identity to disagree about.
- **Through calls.** A project-local function whose call *returns* a live
  object the body produced (not one merely passed through the arguments)
  records the same taint edge (L5.9, `leakedIdentity`). Identity propagates
  through invocation as well as through import.

**F-Taint, F-Fix** *(The fixpoint and its termination)*

Seed with every file that would not fold on its own; walk the union of forward
and reverse edges to closure. Monotone over a finite file set so it
terminates. State it as a least fixpoint.

**F-Cycle** *(Cycles are a located error)*

`FoldSession.stack` (L8.9) detects a genuine reference cycle and reports the
path.

**F-Depth** *(Three depth bounds all of which decide fold versus run)*

`MAX_FUNCTION_CALL_DEPTH = 32` (L5.8), `MAX_INTERPRETATION_DEPTH` (L7.8),
`MAX_RESOLUTION_DEPTH` (L8.10). Each terminates a different recursion and each
turns exhaustion into a fallback. The bounds are implementation-defined and
exceeding one is a fallback and never wrong output.

**F-Prebuild** *(Where a same-file instance comes from)*

F-Eval-Ident step 1 always read its answer out of `externals` and called it
"the one instance J2 pre-built" and no rule of J2 built it. The rules that
produce the namespace were F-Bind through F-Declarator and every arm among
them that wrote `externals` wrote an import.

A reader with L5.2 in hand concluded step 1 always rejects, and the reference
implementation, written from the text, did exactly that. chant, written first,
had the pre-pass all along (`preresolveResourceConsts`). The rule was lost in
the abstraction from code to specification and 22 corpus files disagreed
because of one missing sentence.

**F-Count** *(Evaluation count is observable semantics)*

A composite call reached through several member accesses or destructured names
is invoked **exactly once** (L8.12, `ResolveCtx.memo`) explicitly "matching
what actually running the file would do." A named same-file construction is
built once, in source order, and every reference reads the same object (L3.8).
These are not optimizations; an implementation that invoked twice would produce
two entities where running produces one.

---

**F-Memo** *(A cross-file entity has exactly one instance per build)*

Every referrer of a folded file must observe the same objects. A per-build
session memoizes each file's fold so a file imported by many is folded exactly
once (L8.11), and revival passes live objects through unchanged rather than
reconstructing them (L6.1), the generic walk would destroy the identity it
exists to preserve.

**F-Total** *(The exported namespace is complete and the statement gate is why)*

A successful fold yields every exported name's value (L8.4). This holds *because* the statement gate
disqualifies any file with an unrecognized export.

**F-Succ** *(The reverse and through-call edges)*

The reverse and through-call taint edges are the consequence of this
requirement: single-instance-per-build cannot hold if one side of a sharing
relationship folds while the other runs.

---

**F-Eval-New, F-Eval-Tagged, F-Eval-CallHelper, F-Eval-CallIntrinsic, F-Eval-Member step 2** *(Admissibility depends on where the expression sits)*

Five constructs that fold at a file's top level are refused inside a folded
function body: `new`, a tagged template, a helper call, an intrinsic call, and
`.step` (L3.16, `functionBodyDepth`). Each produces an envelope revived against
the *caller's* imports which is not the scope the body was written in.
`new ns.Type(...)` is refused everywhere because a namespace-qualified
constructor cannot be resolved through named imports (L3.15).

**F-Eval-Ident** *(Shadowing)*

`consts` is consulted before `externals` (L5.3). A local `const` defeats a
registered helper or intrinsic name, the file's own binding wins, so a local
`Ref` is not the lexicon's. A parameter or body binding shadows a module-level
const of the same name.

**F-Bind, F-Eval-Ident, F-Eval-CallLocal** *(What a binding is and the order names resolve in)*

**A top-level binding is a `const` with an identifier name and an initializer**
(`collectConsts`, L5.1). A top-level destructured `const`
(`const { a } = …`) does not bind `a` for the folder and a non-exported
`const` is collected exactly like an exported one. The spec must say this
because the first is a surprise. The declaration is valid TypeScript and the
name is invisible.

**Lookup order is `consts`, then `externals`** (L5.2, `fold.ts` identifier
branch). A name in the file's own `consts` is never looked up in `externals`.
The order is the rule and shadowing is its consequence.

**A project-local function's body folds in the defining module's scope**
(L5.5, `callFoldableFunction`): the arguments fold in the caller's `consts`/
`externals`; the body folds against a copy of the *callee's* `consts` and
`externals`, with each parameter bound by deleting the name from that copy of
`consts` and setting it in `externals` (so a parameter shadows a module-level
const of the same name); `externals` are read live, so a function declared
before a const it reads still sees the const's value. states the same
scope rule for composite factories; this is its counterpart for plain
functions and without it a helper in `lib/` reading `lib/`'s own imports is
unspecified.

---

**F-Call** *(There are three evaluation modes)*

Beyond fold-to-envelope and revival there is a third, and it is the one that
makes folding under isolation possible.

**F-Call step 4** *(Interpret without importing the defining module)*

A composite factory is *interpreted* (L7.1–L7.8) when all five hold:

1. The calling file imports it from a project file, by text, never a package.
2. The defining module has `export const N = Composite(<fn>, "N")` with
   `Composite` bound in *that* module to chant's own.
3. `<fn>` takes at most one plainly-bound parameter.
4. Its body is a concise expression or `const`s then a final `return`.
5. Every expression is in the subset extended with `new` in value position
   and calls through a bare identifier.

A body that references one of its module's own module-level resources declines
(L7.6). That resource is a singleton the run path shares and interpretation would
not. `constResolvesToResource` follows alias chains so it cannot be smuggled
in (`L7.7`).

The defining module is never imported. Members are built by the lexicon's
constructors from the folded props.

**F-Eval-CallEager, F-Eval-CallMethod** *(Evaluate eagerly)*

A lexicon function registered with `intrinsicCallFoldsEagerly` (L2.13) is
called at fold time with folded arguments rather than enveloped, because its
ordinary use coerces the result to string during folding, before any revival
would run.

A method call on a real receiver (L2.14) is the same mode. The receiver is the
same object either way so calling it is what running would do. Both are
places where fold time and revival time are observably different and the spec
must name them as such.

---

**F-Import** *(Build parameters are an input to folding)*

`FoldSession.buildParams` (L5.11) is consulted for exactly one bare specifier:
a named `params` import resolving to chant's `params` module. `params.<name>`
folds to a literal. A bare `process` reference is refused with a message naming
this mechanism as the alternative (L3.7). The `params` object is tracked by
identity like an entity (`fold-import.ts`).

The objective is stated pointwise at a binding because of this requirement. An
implementation without build parameters satisfies it trivially; one with them
must say how the binding enters and that it is recorded.

---

**J4** *(Outputs beyond values and what must be observable)*

Folding produces more than the value tree. Four things each of which J4
states.

**F-Obs-Provenance** *(Provenance is an optional capability outside the equivalence objective)*

`setPathProvenance` (L10.2) records, during fold, which composite parameter
produced which emitted field; the first (innermost) writer wins. It is real
output and it is useful. It is **not** part of the objective: the run path
obtains provenance, where it has any, by a different mechanism, and making
provenance normative would oblige fold and run to agree on a thing the run path
does not uniformly produce.

A conforming implementation *may* expose path provenance; conformance
reports whether it does; the equivalence claim is over serialized output only.
The first-writer-wins rule is stated for implementations that do expose it so
two of them agree on which writer.

**F-Obs-Counters** *(The no-execution observable is normative in shape)*

No-execution is checkable only through the counters (`L10.1`). The rule
therefore fixes their shape and leaves their names to the implementation.
Three integers are enough for a harness to assert zero project-owned
invocations under isolation.

**F-Obs-Report, F-Reason** *(Fallback reporting is normative)*

A fallback must be reported. An unreported fallback is indistinguishable
from a fold and the guarantee becomes unauditable. A conforming implementation must report, per file, the
decision taken and, for a fallback, a located reason (L10.3). The reason's
wording is unconstrained.

**Which location when there are two.** A rejection inside a project-local
function body has a position in the callee's file and a call site in the
caller's. The implementation re-throws at the **call site**, naming the callee and its
file, the position inside it, and the reason, preserving the rule
identifier (L5.10, `callFoldableFunction`). The reported location is the call;
the callee position travels in the message. The spec must say which is
primary because R-spec.3's "located" is otherwise ambiguous for exactly this
case. Whether the report is summarized or verbose by default is a
presentation choice.

**F-Obs-Messages** *(Location and rule are normative)*

chant builds every rejection message of a given kind through one shared
builder so two sites cannot drift (L10.5). That is a property of one
implementation's tooling: a second implementation in another language cannot
share strings and requiring it would make the wording normative by the back
door. What conformance requires is already R-spec.3, the node and the rule
identifier, and `FoldError` carries exactly those (L10.4).

---

**J1** *(Semantics a second implementation cannot guess)* defines the domain and defines membership. Neither says what an operator
*means*. "As ECMAScript" is the usual discharge and it is available for most
of this section, but not all of it, and the places where the implementation
departs from ECMAScript are exactly the ones a second implementation would get
wrong by assuming it.

**F-Eval-Unary, F-Eval-Binary** *(Operators are ECMAScript's on the folded operand values)*

The supported binary operators (L2.8, L3.14) are `+` `-` `*` `/` `===` `!==`
`>` `<` `>=` `<=` and the lazy `&&` `||` `??` (L3.13). Unary `!` and `-`
(L3.12). Conditional `?:`.

For every one of these the implementation applies the host JavaScript operator
to the folded values, so the semantics are ECMAScript's: `+`'s
string-versus-numeric dispatch, relational comparison on strings, and
`&&`/`||` returning an operand rather than a boolean. An implementation in
another language must reproduce ECMAScript coercion for these operators and
never its host's.

**F-Eval-Member step 4** *(Member access on `null`/`undefined` refuses; optional chaining short-circuits)*

A plain property or element read whose object folds to `null`/`undefined` is
**refused** with a located rejection naming the member and pointing at `?.`
(L3.10). The file falls back to run where the same expression throws a
`TypeError`. Fold produces no output and run produces an error which is
equivalence in the sense that a fallback is not wrong output.

`?.` is implemented with ECMAScript short-circuit semantics. A nullish object
under `?.` yields a chain-short-circuit sentinel that propagates through the
remainder of the chain, further member and element reads, `!` non-null
assertions, and a `?.()` method call, and resolves to `undefined` where the
chain ends (L3.21, L3.22).

"As ECMAScript" is therefore available for member access. chant's shape
classifier still admits both forms. The object's value is a resolution, which
is the permitted direction, and the divergence list carries it.

**F-Eval-Member steps 1, 5** *(Attribute references are produced by two rules and refused by a third)*

Property or element access on an identifier bound to a same-file `new` yields
`{__attrRef: {entity, attribute}}` keyed by the identifier (L3.9). Access on a
value that folded to a `{__resource}` envelope yields the same, but only when
the object expression is a plain identifier, any other shape is refused,
because there is no name to key the reference on and silently indexing the
envelope produced wrong output (L3.11, chant#1535).

**F-Eval-Template** *(Template spans coerce by ECMAScript `ToString`)*

`String(fold(span))` (L3.2). For scalars that is ECMAScript. For a symbolic
envelope it is `"[object Object]"`, and the run path produces the same,
because `AttrRef` defines no `toString`.

So fold and run agree and the output is silently wrong on both. That is why
`F-Div-TemplateEnvelope` refuses an envelope in a plain template span instead
of inheriting `ToString` (L3.23).

**F-Eval-Object, F-Eval-Array** *(Key and element ordering are ECMAScript's and byte-identity depends on it)*

Object literals evaluate members in source order; spread is `Object.assign`
so spread keys land in the source's insertion order and a later key wins
(L3.3). Arrays preserve element order; spread splices in place. This is
ECMAScript object-literal evaluation and "as ECMAScript" is available here.

Whether order is *observable* depends on the emitter.

- A lexicon whose serializer produces JSON is re-stringified through
  `sortedJsonReplacer` (`packages/core/src/utils.ts`) which sorts every
  object's keys. YAML for those lexicons is derived from that sorted JSON
  (`cli/commands/build.ts`) so folded key order never reaches the
  output.
- Six lexicons serialize YAML themselves (fountain, docker, gitlab, k8s, gcp,
  github) and their text is emitted as-is, so for them the walker's insertion
  order *is* the output order.

An implementation targeting a host that preserves order would fail
byte-identity with a different key order and nothing in the objective says
which hosts those are.

**F-Eval-Object, F-Eval-Array** *(Spread departs from ECMAScript in one direction)*

Object spread requires a non-null object; array spread requires
`Array.isArray` (L3.4, L3.5). ECMAScript array spread accepts any iterable.
`[...'ab']` is `['a','b']` there and a rejection here. A deliberate narrowing
and one a second implementation would not infer from "as ECMAScript".

---

## The value domain (`values.md`)

**F-Val-Domain** *(The value domain is closed and its symbolic cases are finished values)*

The spec must define what a fold produces. Every other requirement quantifies
over it and it is currently defined only by a TypeScript union
(`FoldedValue`, `fold.ts`; L4.1).

The scalars with `undefined` beside them, plus arrays and plain objects, are
ordinary JSON. The rest carry envelopes.

| Case | Envelope key | Denotes | Fate |
|---|---|---|---|
| `AttrRefValue` | `__attrRef` | an attribute of another entity, resolved at apply | survives |
| `FoldedIntrinsicTag` | `__intrinsic` | registered intrinsic, tagged-template form | revived |
| `FoldedIntrinsicCall` | `__intrinsic` | registered intrinsic, call form | revived |
| `FoldedHelperCall` | `__helper` | registered authoring helper call | revived |
| `FoldedResource` | `__resource` | a construction, top-level or nested as a value | revived |
| `FoldedCompositeStepCall` | `__compositeStep` | `<Identifier>(...).step`, member fixed | revived |
| `SymbolicValue` | `__symbol` | source text preserved inside an intrinsic interior | revived |

**F-Val-Source.** The round trip, `fold(generate(v)) = v`, is what makes
the choice of language a matter of correctness. A generator decides what
each value is: this string is a literal and that one is a reference to
another resource's attribute, while a repetition across forty resources is
one `const`. Each decision needs a form the subset can express and the fold
reverses, and the rule is the completeness half of that property, written
as a table rather than a sentence so that a generator author can read off a
form per case. The table names one form per case and requires only that one exists, so
generators stay comparable without being constrained to agree; and the
property is stated per profile, because in `full` the fold of a resource's
form is a live instance and not the envelope. chant's three generators, `chant import` from a template,
`--from` live import and carve-out from Terraform, emit through one
pipeline (`L12.1`) whose forms are the table's; its Kubernetes round-trip
suite compares resource count and kinds after re-serialization and not
bytes (`L12.4`), so the byte-level measurement the paper wants is still to be
taken.

**F-Val-Envelope** *(Symbolic is finished)*

An `__attrRef` is the envelope `AttrRef.prototype.toJSON()` produces at
runtime and the serializer accepts it without a live instance. A
specification that describes these as "unevaluated" invites an implementation
that tries to force them which is precisely wrong: the denoted value does not
exist at build time in either path.

**F-Val-Fate, F-Val-Position** *(Exactly one envelope survives to serialization and its validity is position-dependent)*

`reviveFoldedValue` (L6.1–L6.9) resolves every envelope *except* `__attrRef`
through the folding file's own imports and invokes the real function or
constructor: `__intrinsic` in both forms (L6.3), `__helper` (L6.4),
`__compositeStep` (L6.5), `__resource` (L6.6), `__symbol` via a dotted-chain
regex (L6.2). None of those may reach a serializer.

`__attrRef` passes through unrevived (L6.7), **except** inside an intrinsic's
or authoring helper's arguments, where it is rejected (L6.8, `requireLiveRefs`)
because the receiver performs `instanceof` checks and `WeakRef` derefs and a
look-alike plain object would produce wrong output rather than absent output.
Composite-step arguments revive with `requireLiveRefs: false` because a
composite stores its props rather than inspecting them (L6.9).

The same value is therefore valid in one position and invalid in
another and which positions are which. A domain definition alone does not
capture this.

**F-Val-Callable** *(Callables are in the domain)*

`FoldableFunction` (L4.4) lets a call to a project-local function fold and is
explicitly *not* a `FoldedValue`: it never appears inside a folded tree. A
function used as a value is refused (L3.1), a `FoldableFunction` reached as a
bare identifier is refused, and an eagerly-evaluated lexicon function
referenced without calling it is refused with "call it instead" (L3.17).

The specification must therefore define a **serializable sub-domain** and say
which positions require it.

**F-Val-Live** *(Liveness is observable)*

`carriesLiveObject` (L4.5) distinguishes folded data from a live instance by
prototype, anything other than `Object`/`Array`/`null`, and additionally
treats `typeof value === "function"` as live. That predicate is what makes the
identity rules in and statable: without a definition of "this value is a
live entity rather than plain data" there is nothing for identity to be a
property of.

**F-Val-Arity** *(Constructor arity is contractual)*

`FoldedResource.args` (L4.2) is present when the argument list is not the
classic `(props)` / `(props, attributes)` shape and is then authoritative:
the entity is constructed by spreading it. `props` is a view. The
`undefined` case in the union (L4.3) has no rule today.

---

**F-Val-Fate** *(Envelope then revive)*

The default for everything's table marks *revived*: `fold()` executes
nothing and records what was named; the bridge resolves the name through the
folding file's imports and invokes it.

**F-Val-Undefined** *(`undefined` is absent in a property and `null` in an array)*

The domain admits `undefined` (L4.3). The serializer walker passes it through
unchanged and keeps the key (`serializer-walker.ts`). The drop
happens at emission, and it happens for both formats, because YAML is produced
by round-tripping the sorted JSON (`cli/commands/build.ts`). `JSON.stringify` has
already removed an `undefined`-valued key and turned an `undefined` array
element into `null` before any YAML exists. That is what makes chant's
build-parameters documentation true ("dropped from the output in both JSON and
YAML rather than shipped as `null`").

The two facts are the difference between "absent" and "null" which platforms
treat differently. For the six YAML-native
lexicons above, the walker's `undefined` reaches *their* emitter directly, so
the rule there is each serializer's and not `JSON.stringify`'s.

**F-Val-Arity** *(Constructor arity)*

`FoldedResource.args` (L4.2): present when the argument list is not
`(props)` or `(props, attributes)`, authoritative when present, the entity
constructed by spreading it; `props` is a view, never re-passed. An
implementation that assumed the props object is always first would construct
`new Parameter("String", {...})` wrongly.

---

---

## Divergence between the shape classifier and the folder (`divergence.md`)

**F-Direction** *(Membership is decided once by a classifier permitted to err in one direction only)*

The subset has exactly one definition: `findSubsetViolation` (`subset.ts`)
shared by the folder and by the lint rules EVL001/EVL003 so the linted subset
and the folded subset cannot drift (L2.*).

**F-Div-*** *(The direction is the requirement)*

The two consumers have different information. A lint pass has no binding
resolver and no lexicon registry; the folder has both. The shape-only
classifier may accept what the resolving evaluator rejects and must never
reject what it accepts.

Enumerated divergences in that direction:

- identifier resolution (L2.3),
- tag registration (L2.4),
- helper provenance (L2.11),
- spread-source runtime type (L3.4, L3.5),
- a bare identifier bound to a same-file construction (L3.8),
- a member read whose object resolves to `null`/`undefined` (L3.10;
  shape-valid, folder refuses).

**F-Exc-Lazy, F-Exc-Registry** *(Two exceptions run the other way)*

Both are named and bounded in F-Exc ([`divergence.md`](./divergence.md)). Each is tolerated for a reason that
would cost more to remove than the exception costs: a flow-sensitive
classifier is an evaluator and the optional registry parameter is what lets a
downstream tool ask "will this fold?" without running a fold.

---

## The host interface (`hosts.md`)

**F-Host-Admission** *(The first clause is observable, partly)*

The clause requires a registered call be a pure function of its arguments.
Nothing verified it. `chant dev check-lexicon` checks the signature and the
export's presence (F-Host-Registry) and says nothing about purity. An eager
intrinsic reading `process.env` was a conforming implementation with a
non-conforming host. The document's own sentence applied to itself here: a
host must provide the equivalent check or its registry is a claim.

`rules.md` states the asymmetry without noticing it. F-Rule-Pure is
"F-Host-Admission's third clause applied to rules" and the conformance runner
has always asked each phase twice and held the two runs to one answer. The
fold half had no such test.

It has one now. Every project fixture is folded twice, the second time with
the environment changed underneath, and the two namespaces must agree. Anything
that makes the second fold differ fails against this rule's name: an
environment read, a clock, a counter, a random source, module-level mutable
state.

**What it does not catch.** A network call that answers the same twice. A
read of an environment name the probe does not set. A constructor that is
heavy but deterministic. Item 1 answers that one at 2.1.

Partial in the way F-Obs-Counters is partial and shipped for the same
reason. A check that catches the cheap cases beats an obligation nothing
checks at all.

Callables are outside it. F-Val-Callable puts a `FoldableFunction` outside the
value domain and an implementation may hand one back carrying its own AST and
a source path the harness writes to a fresh directory per fold. Comparing
those would measure the harness.

**F-Host-Interface item 1** *(What a constructor may do)*

Item 1 enumerated what an entity carries and said nothing about what building
one may do. Revival invokes that constructor (F-Val-Fate). Item 1 was the
one place code runs during a fold with no bound on it. An intrinsic has
F-Host-Admission and a rule has F-Rule-Pure. A constructor had only the shape
of its output and a host could build a dependency graph behind one and
violate no rule.

The bound was already implicit in the form the rule names. A class built by
`createResource(type, lexicon, attrMap)` knows three names and nothing else.
There is nowhere in that to put arbitrary work. The rule described the output
of a construction it had already named and left the construction itself open
by omission.

Validation goes to a rule rather than nowhere. A constructor that throws on
bad props reports mid-fold as a failure to fold with no rule identifier and
no position. F-Rule-Finding names the rule and the position and reaches the
author at the keystroke.

The published measurement is a separate question. `paper/measurements.md`'s
0 MB row records what a CPU profile could see and carries that instrument's
floor. What 2.1 requires is the thinness that row reflects rather than the row
itself. A constructor still runs under revival and counting one exactly is
F-Obs-Counters' job.

---

**F-Host-Trust** *(Trust is decided by resolution)*

Two arms (L9.1–L9.4). Arm 1 is an active lexicon package of *this build*,
matched by text against a closed set built from names the build already
resolved, and its subpaths, by extracting the package root from the specifier
text (L9.2). Arm 2 *resolves* the specifier and checks the resulting path
against chant-core's own tree text being explicitly insufficient there.

A build that supplies no lexicon list keeps only arm 2, disabled, not loosened
(L9.4). The bare-specifier resolution cache is process-wide and assumes no
nested `node_modules` version override (L9.6). That assumption is stated here
and not inherited silently.

---

## Rules over values (`rules.md`)

**F-Rule-Input, F-Rule-Phase.** A syntax linter sees tokens, and a
configuration language with constraints in the type sees one field. Neither
has the values of every file in the build, and that is the fold's
user-facing consequence. chant's post-synthesis checks read `ctx.entities`
for the values and `ctx.outputs` or `ctx.docs` for the artifact, from one
hook, which is why the phase is named by the input.

**F-Rule-Finding.** The subject is an artifact-side name on purpose. chant's
own comment says a finding names an identifier from the synthesized output
such as a CloudFormation logical id and never a source line, and it carries
a missing-resource form for the case where nothing exists to attach to
(chant#2113, Snyk's policy-engine archetype).
Requiring a source line would require value provenance everywhere, which
`F-Obs-Provenance` deliberately leaves optional.

**F-Rule-Pure, F-Rule-Supply.** A project policy is project code. chant
refuses to load one into its own process while the sandbox is armed and
runs it in the child instead, which is the isolation mode's
boundary drawn once more around rules.

The fixtures for this family carry the finding as data and not the rule
since a rule is host code. The `shapes` host names two rules by id and phase,
a fixture's `findings` says what they report, and an implementation that
carries no rule of that id says so and is skipped visibly.

The runner asks for each phase twice and holds the two runs to the same
answer which is F-Rule-Pure tested before anything else. `compareAdapters`
holds two implementations to the same findings which is F-Rule-Equivalence.
