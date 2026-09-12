# The host interface

Normative draft (#16). What a host supplies to make the subset mean
something, and the rule by which each supplied thing is admitted. Rules are
`F-Host-*`. Derived from `IntrinsicDef` and the three fold predicates
(`lexicon.ts:219–352`), `createResource`/`createProperty` (`runtime.ts:21,
67`), `FOLDABLE_AUTHORING_HELPERS` and its admission criteria
(`foldable-helpers.ts`), `isTrustedExecutableBinding`, and
`findCompositeDefinition`, at `e4074c17`.

The extraction (#19, `packages/reference/CUTS.md`) confirmed this list without
amendment. The expression layer needed items 3, 4 and 5 and nothing else;
items 1, 2 and 6 live in revival and interpretation, which the reference
implementation does not yet port (#21, #22).

---

## F-Host-Interface (what a host supplies)

Six things. The first four are the parameters R7 named; the last two are
what the trust rules need.

1. **Entity constructors.** Classes whose instances are entities: built by
   `createResource(type, lexicon, attrMap)`, `new (props, attributes?)` -
   or `createProperty(type, lexicon)`, `new (props)`. They carry a
   non-enumerable declarable marker, `lexicon`, `entityType`, and for
   properties `kind: "property"`. Revival constructs them (F-Val-Fate).
2. **Attribute exposure.** `attrMap` names the attributes an entity exposes;
   reading one on a live instance yields an `AttrRef` bound to that instance
   (F-Val-Live), and on a *name* yields the `{__attrRef}` envelope (R10.3).
3. **An intrinsic registry** `ρ`: a list of `IntrinsicDef`.
4. **An authoring-helper allowlist**: names a call may fold through as a
   `{__helper}` envelope.
5. **A trust set**: the package specifiers this build resolved and loaded
   (R2.1 arm 1), plus the host's own module tree (arm 2).
6. **A composite registration form**, `export const N = Composite(fn, "N")`
   with `Composite` imported from the host, that makes a project-defined
   factory *interpretable* (R7.2).
7. **Rules**: the host's semantic checks over the folded namespace and the
   artifact, under the contract of `rules.md` (F-Rule-Supply). A project may
   supply more as a policy.

In the `data-host` profile (F-Profile-DataHost, judgments.md) a host is a
description rather than code: item 3, item 5, and a serialization mapping
that says what each envelope becomes in the artifact. Items 1, 2, 4 and 6
need something to invoke and are absent.

## F-Host-Registry (the shape of an intrinsic registration)

```
IntrinsicDef = { name, isTag: boolean, foldsAsCall?: boolean, foldsEagerly?: boolean, … }
```

- `isTag` is **required**. An omitted value once defaulted silently to "not a
  tag" and shipped the most-used intrinsic in the ecosystem unfoldable
  (chant#1039, #1067). A registry entry that does not say is invalid.
- `isTag`, `foldsAsCall` and `foldsEagerly` are **mutually exclusive**. The
  three fold predicates are: tag folds iff `isTag`; call form folds iff
  `¬isTag ∧ foldsAsCall`; eager folds iff `¬isTag ∧ foldsEagerly`.
- `foldsAsCall` and `foldsEagerly` are **opt-in, per intrinsic, default
  off**, and never inferred from the name, the tag flag, or the call's shape
  (R3.3: closed allowlists).
- A registration is **validated against the export it names**, tagged
  template signature versus plain call, and presence in the package's own
  exports (`chant dev check-lexicon`). A host must provide the equivalent
  check or its registry is a claim, not a fact.

## F-Host-Admission (when a call may be registered)

A call-form intrinsic, an eager intrinsic, or an authoring helper qualifies
**only** if all hold:

- it is a **pure function of its arguments**, no I/O, no environment read,
  no module-level mutable state, no observable side effect;
- it builds a **deterministic envelope or plain data** from them;
- **invoking it at fold time is indistinguishable from invoking it during a
  real run** of the file.

That third clause is the whole correctness argument for every registered
call, and it is the same-function principle: revival invokes the function
the file's `import` names, never a reimplementation (F-Host-NoSubstitution).
Explicitly excluded by chant, with the reason each fails: `env()` reads
`process.env`; `Op()` returns an entity, and an entity-returning factory is
the nested-construction hazard wearing a call; `propagate()`,
`withDefaults()`, `resource()`, `mergeDefaults()` are composite *definition*
helpers and `propagate` mutates in place; `createResource()`/
`createProperty()` build classes at a module's top level, never as a value.

## F-Host-Closed-vs-Open (why packages are closed and project files are open)

A call into a **package** folds only through a closed allowlist, a
registered intrinsic or helper, checked by name *and* by the provenance of
the binding (R3.3, F-Div-Provenance). A call into a **project file** folds
whenever the callee's body is itself in the subset (R6.5), with no allowlist.

The asymmetry is the trust boundary (R2.1, #36). Package code is already
loaded and executed by the build before discovery begins; admitting a call
into it costs no execution the process was not performing, so it is admitted
by declaration and verified by registration. Project code is the untrusted
input; it is admitted only when it can be *evaluated without being
executed*, folded or interpreted, which a syntactic body check decides and
an allowlist could not.

## F-Host-NoSubstitution (the function that runs is the one imported)

For every registered name, helper, intrinsic, constructor, composite -
revival resolves the name **through the folding file's own `import`
bindings** and invokes what it finds (F-Val-Fate, J2 F-Call). A host never
substitutes its own implementation for a registered name. Two consequences:
a same-named helper the file declared or imported from elsewhere is not the
host's, and the file falls back (F-Div-Provenance); and the registry cannot
drift from the helpers' real behaviour, because it never reimplements them.
This is the CTFE principle ([`prior-art.md`](./prior-art.md)) made a rule.

## F-Host-Composite (the registration that admits interpretation)

A project file's composite is interpretable (R7.2 rule 2) iff its defining
module has `export const N = Composite(fn, "N")` where `Composite` is bound,
*in that module*, to an import of the host's own, `fn` is an arrow or
function expression, and the name argument is absent or a string literal. A
plain helper that returns a composite is not registered and stays on the
invoking path. A host that offers interpretation must define an equivalent
registration form; the shape of `fn` is S-FactoryBody.

## F-Host-DataExports (a package's plain data folds as values)

A named import from an **active** package resolves to the package's real
export (J2 F-Import). A plain-data export, a pseudo-parameter namespace, an
action-constant table, folds as a value; a live `Intrinsic` instance passes
through revival unchanged (F-Val-Live). A namespace import of a package is
never resolved (F-Namespace), so nothing is reachable through `ns.x` from a
package: the class or intrinsic has to be reachable through a *named*
import.

## F-Host-Trust (what may be imported during a fold)

Arm 1: a specifier that is an active package of this build, or a subpath of
one, matched by text against the closed set the build already resolved. Arm
2: a specifier that *resolves* to a path inside the host's own module tree -
text is insufficient because an untrusted repository controls both its
source and its `node_modules`. Nothing else, and a build with no package
list keeps only arm 2 (R2.1). Under `ι = isolated`, an import outside both
arms is F-IsolatedRefusal (J2).

## F-Host-Generality (what varies and what does not)

What a host may vary: the six items of F-Host-Interface. What it may not:
the syntax (grammar.md), the semantics of admitted operators (R10, J1), the
module system, the value domain's shape (values.md), the judgments (J1–J3),
and the direction claim (divergence.md). Generality is over **host
vocabularies**, not languages (`README.md`, Scope). A host is one
instantiation; chant's lexicons are the reference instantiation, and the
reference implementation (#19, #20) is meant to carry the interface without
any of them.

---

## Rationale

Non-normative. The reasoning that motivated each rule, carried over from the retired `requirements.md` (#46). Keyed by the rule(s) each note supports.

**F-Host-Trust** *(was R2.1. Trust is decided by resolution, never by the text of a specifier)*

Two arms (L9.1–L9.4). Arm 1: an active lexicon package of *this build*,
matched by text against a closed set built from names the build already
resolved, and its subpaths, by extracting the package root from the specifier
text (L9.2). Arm 2: the specifier is *resolved* and the resulting path checked
against chant-core's own tree; text is explicitly insufficient because an
untrusted repository controls both its source and its `node_modules`.

A build that supplies no lexicon list keeps only arm 2, disabled, not loosened
(L9.4). One documented, accepted unsoundness: the bare-specifier resolution
cache is process-wide and assumes no nested `node_modules` version override
(L9.6); the spec should state it as an assumption rather than inherit it
silently.
