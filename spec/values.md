# The value domain

Normative draft (#39). What a fold produces. Rules are `F-Val-*`: the value
domain is a property of folding's output, not of syntax, so it takes the
`F-*` prefix (noted for #46). Derived from `FoldedValue` and its cases
(`fold.ts:116–300`), `FoldableFunction` (`fold.ts:378`), `carriesLiveObject`
(`fold.ts:411`), `isFoldSymbolicEnvelope`, and `reviveFoldedValue`
(`fold-import.ts:2643`), at `e4074c17`.

---

## F-Val-Domain (the closed union)

A folded value `v` is exactly one of:

| Case | Form | Row |
|---|---|---|
| scalar | `string` \| `number` \| `boolean` \| `null` \| `undefined` | L4.1 |
| array | `v[]` | L4.1 |
| object | `{ [k: string]: v }` with prototype `Object` | L4.1 |
| attribute reference | `{ __attrRef: { entity, attribute } }` | L3.9 |
| intrinsic, tag form | `{ __intrinsic, strings: string[], values: v[] }` | L6.3 |
| intrinsic, call form | `{ __intrinsic, args: v[] }` | L6.3 |
| helper call | `{ __helper, args: v[] }` | L6.4 |
| resource | `{ __resource, props, attributes?, args? }` | L6.6 |
| composite step | `{ __compositeStep, args: v[] }` | L6.5 |
| symbol | `{ __symbol: string }` | L6.2 |

Nothing else. In particular no function is a `v` (F-Val-Callable), and no
live instance is a `v`, a live instance is what an envelope becomes
(F-Val-Live).

## F-Val-Envelope (six envelopes, recognised by key)

A value is an *envelope* iff it is a non-array object carrying one of the keys
`__attrRef`, `__intrinsic`, `__helper`, `__resource`, `__compositeStep`,
`__symbol` (`isFoldSymbolicEnvelope`). An envelope is a finished value that
*denotes* something not yet constructed (R1.1); it is never a thunk, and an
implementation must not attempt to force it.

## F-Val-Fate (what happens to each envelope)

Revival (R7.1, `reviveFoldedValue`) walks a folded tree and replaces
envelopes:

| Envelope | Fate |
|---|---|
| `__attrRef` | **passes through unchanged** — the serializer accepts the plain envelope (L6.7) |
| `__intrinsic` (both forms) | revived: the intrinsic function the file's import names is invoked — `Name(strings, ...values)` or `Name(...args)` (L6.3) |
| `__helper` | revived: the helper the file's import names is invoked with the revived args (L6.4) |
| `__resource` | revived: the class the file's import names is constructed — from `props`/`attributes`, or by spreading `args` when present (L6.6, F-Val-Arity) |
| `__compositeStep` | revived: the composite is resolved (J2 F-Call), then `.step` is read off the real result (L6.5) |
| `__symbol` | revived: the text must match a simple dotted chain; its root resolves through the file's imports and the rest is real property access (L6.2) |

In the `data-host` profile (F-Profile-DataHost, judgments.md) none of these
fates runs: revival is serialization, every envelope is the output, and the
host's serialization mapping is what turns it into the artifact.

**Exactly one envelope survives to serialization: `__attrRef`.** The other
five must never reach a serializer (R1.2). An implementation that emits a
`__resource` envelope has produced wrong output, not a placeholder.

## F-Val-Position (validity is position-dependent)

Revival carries a flag `requireLiveRefs`. It is **true** inside the
arguments of an `__intrinsic` or `__helper`, the receiving function inspects
what it is given (`instanceof`, `WeakRef` derefs), and there a `__attrRef`
envelope is **rejected**, not passed (L6.8): a look-alike plain object would
produce wrong output rather than absent output. It is **false** for the
arguments of a `__compositeStep` and for a top-level resource's props (L6.9):
a composite stores its props rather than inspecting them, and the serializer
resolves the envelope by name.

So the same `v` is valid in one position and a rejection in another. A
specification of the domain alone does not capture this; the rule is part of
the domain.

## F-Val-Live (liveness)

A value *carries a live object* iff it, or anything reachable through plain
objects and arrays, has a prototype other than `Object`, `Array`, or `null`
- or is a function (`carriesLiveObject`; R1.4, L4.5). Live objects reached
through cross-file resolution, an `AttrRef` instance, a `Declarable`, a
`CompositeInstance`, an `Intrinsic` instance, **pass through revival
unchanged** (L6.1): the generic walk would rebuild a plain copy and destroy
the identity J3 exists to preserve. `isIntrinsic` is keyed on a global
`Symbol.for`, so this holds across separately loaded copies of the core.

Liveness is the *entity test* of F-Identity (J3), and is what F-CallLeak
tests. F-Capture and F-Import test something broader; F-Identity says which
is normative and what the difference costs.

## F-Val-Callable (functions are callable, never values)

`FoldableFunction` (R1.3) is a marker for a project-local function J1 may
*call*. It is **not** a `v`, never appears inside a folded tree, and is
refused anywhere a value is required: `{ resolver: φ }` does not fold though
`φ(x)` does (L3.1, L4.4). An eagerly-evaluated lexicon function referenced
without calling it is refused likewise, with "call it instead" (L3.17).

## F-Val-Serializable (the sub-domain that may reach output)

A value may reach a serializer iff it is: a scalar; an array or object all of
whose members may; an `__attrRef` envelope; or a live instance produced by
revival. Every other envelope, and every callable, may not. The objective's
"byte-identical serialized output" is stated over this sub-domain.

## F-Val-Arity (a resource's constructor arguments)

`__resource.props` is the first object-literal argument. When the argument
list is not `(props)` or `(props, attributes)`, e.g. `new Parameter("String",
{…})`, `args` is present and **authoritative**: the entity is constructed by
spreading it, and `props` is reported for readers but never re-passed (L4.2,
R10.8, R1.5).

## F-Val-Undefined (`undefined` in the domain)

`undefined` is a scalar of the domain (L4.3). A property whose value is
`undefined` is **present** in the folded namespace, with that value, and a
spread copies it like any other own entry; the namespace therefore keeps the
distinction between an absent key and an `undefined` one, which a consumer
whose contract is selective-by-omission depends on (#82). Emission is where
the key is dropped, and an `undefined` array element becomes `null` there,
for both JSON and YAML, because YAML is round-tripped through the JSON
emitter (R10.7). For a lexicon that serializes YAML itself, the rule is that
serializer's own.

## F-Val-Symbol-Scope (where `__symbol` may appear)

Only inside an intrinsic's interior, a tag's interpolations or a call form's
arguments (`foldIntrinsicValue`). Anywhere else an unresolved chain is a
located rejection (F-Reference, J2). A `__symbol` therefore never appears at
the top of a folded tree.

---

## Rationale

Non-normative. The reasoning that motivated each rule, carried over from the retired `requirements.md` (#46). Keyed by the rule(s) each note supports.

**F-Val-Domain** *(was R1. The value domain is closed, and its symbolic cases are finished values)*

The spec must define what a fold produces. Every other requirement quantifies
over it, and it is currently defined only by a TypeScript union
(`FoldedValue`, `fold.ts:116`; L4.1).

Nine cases. Six are ordinary JSON, string, number, boolean, null, undefined,
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

**F-Val-Envelope** *(was R1.1. Symbolic is not unevaluated)*

An `__attrRef` is not a thunk. It is the envelope `AttrRef.prototype.toJSON()`
produces at runtime, and the serializer accepts it without a live instance. A
specification that describes these as "unevaluated" invites an implementation
that tries to force them, which is precisely wrong: the denoted value does not
exist at build time in either path.

**F-Val-Fate, F-Val-Position** *(was R1.2. Exactly one envelope survives to serialization, and its validity is position-dependent)*

This corrects the first revision, which had it backwards.

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

So the spec must say: the same value is valid in one position and invalid in
another, and which positions are which. A domain definition alone does not
capture this.

**F-Val-Callable** *(was R1.3. Callables are in the domain but are not values)*

`FoldableFunction` (L4.4) lets a call to a project-local function fold, and is
explicitly *not* a `FoldedValue`: it never appears inside a folded tree. A
function used as a value is refused (L3.1), a `FoldableFunction` reached as a
bare identifier is refused, and an eagerly-evaluated lexicon function
referenced without calling it is refused with "call it instead" (L3.17).

The specification must therefore define a **serializable sub-domain** and say
which positions require it.

**F-Val-Live** *(was R1.4. Liveness is observable and the spec must say so)*

`carriesLiveObject` (L4.5) distinguishes folded data from a live instance by
prototype, anything other than `Object`/`Array`/`null`, and additionally
treats `typeof value === "function"` as live. That predicate is what makes the
identity rules in R4 and R5 statable: without a definition of "this value is a
live entity rather than plain data," there is nothing for identity to be a
property of.

**F-Val-Arity** *(was R1.5. Constructor arity is contractual)*

`FoldedResource.args` (L4.2) is present when the argument list is not the
classic `(props)` / `(props, attributes)` shape, and is then authoritative:
the entity is constructed by spreading it. `props` is a view. The
`undefined` case in the union (L4.3) has no rule today. Both are #42's.

---

**F-Val-Fate** *(was R7.1. Envelope, then revive)*

The default for everything R1's table marks *revived*: `fold()` executes
nothing and records what was named; the bridge resolves the name through the
folding file's imports and invokes it (R1.2, R2).

**F-Val-Undefined** *(was R10.7, `undefined` is absent, not `null`, in a property; and is `null` in an array)*

The domain admits `undefined` (L4.3). The serializer walker passes it through
unchanged and keeps the key (`serializer-walker.ts:33`, `:117`); the drop
happens at emission, and, verified, it happens for both formats because
YAML is produced by round-tripping the sorted JSON (`build.ts:743–746`), so
`JSON.stringify` has already removed an `undefined`-valued key and turned an
`undefined` array element into `null` before any YAML exists. That is what
makes chant's build-parameters documentation true ("dropped from the output
in both JSON and YAML rather than shipped as `null`"). Both facts must be
stated because they are the difference between "absent" and "null", which
platforms treat differently, and for the six YAML-native lexicons above the
walker's `undefined` reaches *their* emitter directly, so the rule there is
each serializer's, not `JSON.stringify`'s.

**F-Val-Arity** *(was R10.8. Constructor arity)*

`FoldedResource.args` (L4.2, R1.5): present when the argument list is not
`(props)` or `(props, attributes)`, authoritative when present, the entity
constructed by spreading it; `props` is a view, never re-passed. An
implementation that assumed the props object is always first would construct
`new Parameter("String", {...})` wrongly.

---
