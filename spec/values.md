# The value domain

Normative draft (#39). What a fold produces. Rules are `F-Val-*`: the value
domain is a property of folding's output, not of syntax, so it takes the
`F-*` prefix (noted for #46). Derived from `FoldedValue` and its cases
(`fold.ts:116–300`), `FoldableFunction` (`fold.ts:378`), `carriesLiveObject`
(`fold.ts:411`), `isFoldSymbolicEnvelope`, and `reviveFoldedValue`
(`fold-import.ts:2643`), at `e4074c17`.

---

## F-Val-Domain — the closed union

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
live instance is a `v` — a live instance is what an envelope becomes
(F-Val-Live).

## F-Val-Envelope — six envelopes, recognised by key

A value is an *envelope* iff it is a non-array object carrying one of the keys
`__attrRef`, `__intrinsic`, `__helper`, `__resource`, `__compositeStep`,
`__symbol` (`isFoldSymbolicEnvelope`). An envelope is a finished value that
*denotes* something not yet constructed (R1.1); it is never a thunk, and an
implementation must not attempt to force it.

## F-Val-Fate — what happens to each envelope

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

**Exactly one envelope survives to serialization: `__attrRef`.** The other
five must never reach a serializer (R1.2). An implementation that emits a
`__resource` envelope has produced wrong output, not a placeholder.

## F-Val-Position — validity is position-dependent

Revival carries a flag `requireLiveRefs`. It is **true** inside the
arguments of an `__intrinsic` or `__helper` — the receiving function inspects
what it is given (`instanceof`, `WeakRef` derefs) — and there a `__attrRef`
envelope is **rejected**, not passed (L6.8): a look-alike plain object would
produce wrong output rather than absent output. It is **false** for the
arguments of a `__compositeStep` and for a top-level resource's props (L6.9):
a composite stores its props rather than inspecting them, and the serializer
resolves the envelope by name.

So the same `v` is valid in one position and a rejection in another. A
specification of the domain alone does not capture this; the rule is part of
the domain.

## F-Val-Live — liveness

A value *carries a live object* iff it, or anything reachable through plain
objects and arrays, has a prototype other than `Object`, `Array`, or `null`
— or is a function (`carriesLiveObject`; R1.4, L4.5). Live objects reached
through cross-file resolution — an `AttrRef` instance, a `Declarable`, a
`CompositeInstance`, an `Intrinsic` instance — **pass through revival
unchanged** (L6.1): the generic walk would rebuild a plain copy and destroy
the identity J3 exists to preserve. `isIntrinsic` is keyed on a global
`Symbol.for`, so this holds across separately loaded copies of the core.

Liveness is what F-Capture (J3) and F-CallLeak test.

## F-Val-Callable — functions are callable, never values

`FoldableFunction` (R1.3) is a marker for a project-local function J1 may
*call*. It is **not** a `v`, never appears inside a folded tree, and is
refused anywhere a value is required: `{ resolver: φ }` does not fold though
`φ(x)` does (L3.1, L4.4). An eagerly-evaluated lexicon function referenced
without calling it is refused likewise, with "call it instead" (L3.17).

## F-Val-Serializable — the sub-domain that may reach output

A value may reach a serializer iff it is: a scalar; an array or object all of
whose members may; an `__attrRef` envelope; or a live instance produced by
revival. Every other envelope, and every callable, may not. The objective's
"byte-identical serialized output" is stated over this sub-domain.

## F-Val-Arity — a resource's constructor arguments

`__resource.props` is the first object-literal argument. When the argument
list is not `(props)` or `(props, attributes)` — e.g. `new Parameter("String",
{…})` — `args` is present and **authoritative**: the entity is constructed by
spreading it, and `props` is reported for readers but never re-passed (L4.2,
R10.8, R1.5).

## F-Val-Undefined — `undefined` in the domain

`undefined` is a scalar of the domain (L4.3). In a property position it is
dropped at emission; in an array position it becomes `null` — for both JSON
and YAML, because YAML is round-tripped through the JSON emitter (R10.7). For
a lexicon that serializes YAML itself, the rule is that serializer's own.

## F-Val-Symbol-Scope — where `__symbol` may appear

Only inside an intrinsic's interior — a tag's interpolations or a call form's
arguments (`foldIntrinsicValue`). Anywhere else an unresolved chain is a
located rejection (F-Reference, J2). A `__symbol` therefore never appears at
the top of a folded tree.
