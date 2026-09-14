# The value domain

Normative draft. What a fold produces. Rules are `F-Val-*`: the value
domain is a property of folding's output so it takes the `F-*` prefix. Derived from `FoldedValue` and its cases
(`fold.ts`), `FoldableFunction` (`fold.ts`), `carriesLiveObject`
(`fold.ts`), `isFoldSymbolicEnvelope`, and `reviveFoldedValue`
(`fold-import.ts`), at `e4074c17`.

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

## F-Val-Envelope (six envelopes recognized by key)

A value is an *envelope* iff it is a non-array object carrying one of the keys
`__attrRef`, `__intrinsic`, `__helper`, `__resource`, `__compositeStep`,
`__symbol` (`isFoldSymbolicEnvelope`). An envelope is a finished value that
*denotes* something not yet constructed; it is never a thunk and an
implementation must not attempt to force it.

## F-Val-Fate (what happens to each envelope)

Revival (`reviveFoldedValue`) walks a folded tree and replaces each
envelope by its fate.

| Envelope | Fate |
|---|---|
| `__attrRef` | **passes through unchanged** — the serializer accepts the plain envelope (L6.7) |
| `__intrinsic` (both forms) | revived: the intrinsic function the file's import names is invoked — `Name(strings, ...values)` or `Name(...args)` (L6.3) |
| `__helper` | revived: the helper the file's import names is invoked with the revived args (L6.4) |
| `__resource` | revived: the class the file's import names is constructed — from `props`/`attributes`, or by spreading `args` when present (L6.6, F-Val-Arity) |
| `__compositeStep` | revived: the composite is resolved (J2 F-Call), then `.step` is read off the real result (L6.5) |
| `__symbol` | revived: the text must match a simple dotted chain; its root resolves through the file's imports and the rest is real property access (L6.2) |

In the `data-host` profile (F-Profile-DataHost, objective.md) none of these
fates runs. Revival is serialization, every envelope is the output, and the
host's serialization mapping is what turns it into the artifact.

**Exactly one envelope survives to serialization: `__attrRef`.** The other
five must never reach a serializer. An implementation that emits a
`__resource` envelope has produced wrong output.

## F-Val-Position (validity is position-dependent)

Revival carries a flag `requireLiveRefs`.

- **True** inside the arguments of an `__intrinsic` or `__helper`. The
  receiving function inspects what it is given (`instanceof`, `WeakRef`
  derefs), so a `__attrRef` envelope is **rejected** there rather than passed
  (L6.8). A look-alike plain object would produce wrong output rather than
  absent output.
- **False** for the arguments of a `__compositeStep` and for a top-level
  resource's props (L6.9). A composite stores its props rather than
  inspecting them and the serializer resolves the envelope by name.

So the same `v` is valid in one position and a rejection in another. A
specification of the domain alone does not capture this; the rule is part of
the domain.

## F-Val-Live (liveness)

A value *carries a live object* iff it, or anything reachable through plain
objects and arrays, has a prototype other than `Object`, `Array`, or `null`,
or is a function (`carriesLiveObject`, L4.5).

Live objects reached through cross-file resolution, an `AttrRef` instance, a
`Declarable`, a `CompositeInstance`, an `Intrinsic` instance, **pass through
revival unchanged** (L6.1). The generic walk would rebuild a plain copy and
destroy the identity J3 exists to preserve. `isIntrinsic` is keyed on a global
`Symbol.for` so this holds across separately loaded copies of the core.

Liveness is the *entity test* of F-Identity (J3) and is what F-CallLeak
tests. F-Capture and F-Import test something broader; F-Identity says which
is normative and what the difference costs.

## F-Val-Callable (functions are callable)

`FoldableFunction` is a marker for a project-local function J1 may
*call*. It is **not** a `v`, never appears inside a folded tree, and is
refused anywhere a value is required: `{ resolver: φ }` does not fold though
`φ(x)` does (L3.1, L4.4). An eagerly-evaluated lexicon function referenced
without calling it is refused likewise with "call it instead" (L3.17).

## F-Val-Serializable (the sub-domain that may reach output)

A value may reach a serializer iff it is: a scalar; an array or object all of
whose members may; an `__attrRef` envelope; or a live instance produced by
revival. Every other envelope, and every callable, may not. The objective's
"byte-identical serialized output" is stated over this sub-domain.

## F-Val-Arity (a resource's constructor arguments)

`__resource.props` is the first object-literal argument. When the argument
list is not `(props)` or `(props, attributes)`, e.g. `new Parameter("String",
{…})`, `args` is present and **authoritative**: the entity is constructed by
spreading it, and `props` is reported for readers but never re-passed (L4.2).

## F-Val-Undefined (`undefined` in the domain)

`undefined` is a scalar of the domain (L4.3). A property whose value is
`undefined` is **present** in the folded namespace, with that value, and a
spread copies it like any other own entry. The namespace therefore keeps the
distinction between an absent key and an `undefined` one which a consumer
whose contract is selective-by-omission depends on.

Emission is where the key is dropped, and an `undefined` array element becomes
`null` there, for both JSON and YAML, because YAML is round-tripped through
the JSON emitter. For a lexicon that serializes YAML itself, the rule is that
serializer's own.

## F-Val-Symbol-Scope (where `__symbol` may appear)

Only inside an intrinsic's interior, a tag's interpolations or a call form's
arguments (`foldIntrinsicValue`). Anywhere else an unresolved chain is a
located rejection (F-Reference, J2). A `__symbol` therefore never appears at
the top of a folded tree.

## F-Val-Source (every value has a source form)

For every value `v` of F-Val-Domain there is source in the subset
(grammar.md) whose fold, in the profile named, is `v`. The table names one
such form per case which is the form a generator should prefer and not the
only one the subset admits.

| Case | A source form that folds to it | In |
|---|---|---|
| scalar | the literal: `"s"`, `1.5`, `true`, `null`, `undefined` (F-Eval-Literal, F-Eval-Undefined) | both |
| array, object | the literal, with each member's source form as its element or value; a key that is not an identifier is a string key (S-Prop) | both |
| attribute reference `{__attrRef: {entity, attribute}}` | `entity.attribute`, where `entity` is a same-file `const` bound to a `new` (F-Eval-Member step 1, F-Prebuild) | both |
| intrinsic, tag form `{__intrinsic, strings, values}` | the tagged template `name\`s₀${v₀}s₁…\`` for a registered tag (F-Eval-Tagged) | both |
| intrinsic, call form `{__intrinsic, args}` | `name(args…)` for an intrinsic registered with `foldsAsCall` (F-Eval-CallIntrinsic) | both |
| helper call `{__helper, args}` | `name(args…)` for a registered helper (F-Eval-CallHelper). J1 yields the envelope and revival invokes the helper, so the envelope is never the output | `full` |
| resource `{__resource, props, attributes?, args?}` | `new C(props)`, `new C(props, attributes)`, or `new C(…args)` when `args` is present (F-Eval-New, F-Val-Arity) | both |
| composite step `{__compositeStep, args}` | the interpretable factory form (F-Host-Composite) | `full` |
| symbol `{__symbol}` | the unresolved chain, written inside an intrinsic's interior (F-Eval-Interior, F-Val-Symbol-Scope) | both |

Nothing else is a value, so nothing else needs a form, and the fold of a
form in `full` is the value after F-Val-Fate, so a resource's form folds to a
live instance there and to the envelope in `data-host`; the round trip
(README.md, "the generator obligation") is stated per profile for that
reason. A live instance has no source form of its own: its form is the
envelope's.
