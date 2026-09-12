# What the reference implementation does not do, and what it found

This package is written from `spec/` and nothing else (#50). Where the
specification is silent, ambiguous, or asks for something the package cannot
supply, the gap is recorded here rather than papered over in the code.

## Two identity predicates

Resolved in the specification by **F-Identity** (J3), which names the entity
test and the reference test, says the entity test is the normative one, and
says F-Import over-approximates on purpose. This package follows it: the
reference test for import and re-export captures, the entity test for call
leaks. Kept here as a pointer, because the code comments cite F-Identity and
a reader of an older revision will not find it (#59).

## Revival needs a host, and one envelope has no fate here

**F-Val-Fate** is implemented (#61): a declarator's value is revived through
the folding file's own imports, so a `{__resource}` becomes a real instance of
the class the host supplies, `{__intrinsic}` and `{__helper}` are invoked, and
`{__symbol}` resolves as a dotted chain. `{__attrRef}` passes through, and is
rejected inside a host call's arguments per **F-Val-Position**.

Two limits remain.

`{__compositeStep}` has no fate here. Its revival is "resolve the composite
(J2 F-Call), then read `.step` off the real result", and this package has no
composite factory form, so revival rejects rather than guessing.

Revival can only construct what a host supplies. With `EMPTY_HOST` an envelope
has no class to become and revival rejects, which is correct rather than
silent: a build that folds a resource and cannot revive it has not folded the
file. Conformance fixtures name the host they need.

## The composite factory form, measured

The corpus cross-check (#25) puts a number on the gap above: 272 of chant's
409 corpus files reach a composite factory call, directly or through a file
that does, and none of them can be compared until this package has the form.
The count is in `packages/conformance/corpus-report.md`.

## Capture reaches inside an entity

**F-Capture** is decided over the produced namespace, and the walk that decides
it descends through an entity's own data properties, enumerable or not, and
through a `WeakRef` to what it holds. chant's entity classes keep their props
on a non-enumerable property and an attribute reference keeps its entity
behind a `WeakRef`, so a walk over `Object.values` records no capture for the
two ordinary cases: a shared object passed to a constructor, and an output
built from another file's attribute. Neither was visible until the corpus ran
against a real host (#25), because with `EMPTY_HOST` an entity never becomes
an instance. Accessors are skipped, not invoked; one of chant's throws when
read too early.

## Same-file constructions are pre-built

**F-Prebuild** (#68) is implemented: every top-level `const n = new T(…)` is
constructed once, in source order, before any declarator is evaluated, and a
reference to it reads that instance. This package originally rejected such a
reference, which was the reading F-Eval-Ident step 1 licensed before the rule
existed; the corpus found twelve chant examples that fold the shape.

## Capture at the import, and over the namespace

**F-Import** records a capture at the import for any imported value with
identity, by F-Identity's reference test; **F-Capture** is decided over the
produced namespace as well. This package did only the second until the
corpus at `chant-v0.71.0` showed three files that read a primitive out of an
imported object, held no object in their namespace, and were tainted by
chant as F-Import's text says; it now does both (#96). A project-local
function is excluded at the import, since it is a callable rather than a
value and F-CallLeak decides its edge at the call.

## The smallest generator

`generate.ts` (#80) writes one module for a namespace of values, one form per case of `F-Val-Source` and nothing factored: no shared `const`, no parameter, every value inline. It is what makes the round trip executable, not a generator anyone would ship. A value with no form here, a helper call or a composite step in `data-host`, a symbol outside an interior, a live instance, is reported as such and the fixture is skipped rather than approximated.

## Two rules, and no provenance

`rules.md` (spec `1.4`) specifies the contract a semantic rule runs under. This package carries the two rules the `shapes` host names, `SHAPES001` over the folded namespace and `SHAPES002` over its JSON serialization (`rules.ts`, #101), and nothing else: a host that names a rule this file does not carry gets `"unavailable"`. A file that runs has no folded namespace here, so no rule sees it; chant answers that case by executing the file. There is no value provenance, so a finding names an export and never a source line, which `F-Rule-Finding` allows.

## No filesystem, no module resolution algorithm

`foldProject` takes a map of path to source. Specifier resolution joins the
specifier to the importer's directory, normalises `..` segments, and tries
the three obvious candidates, `g`, `g.ts`, `g/index.ts`, against that map's
keys. An earlier version left `../` specifiers unjoined, which dropped an
import edge and a forward taint with it; the corpus found it (#96). The
specification does not define a resolution algorithm, and does not need to:
J3's `→` is "`f` imports `g`, `g ∈ F`" for whatever resolution the host uses.
A conformance fixture therefore never depends on a resolution subtlety.

## No isolation mode

`ι` is always `open`. **F-IsolatedRefusal** distinguishes a mode in which
resolving a binding would import or invoke project code, and this package
never imports or invokes anything: every call it admits is J1's project-local
call, which F-IsolatedRefusal explicitly does not restrict. The mode is
therefore unobservable here, not unimplemented.
