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

## No filesystem, no module resolution algorithm

`foldProject` takes a map of path to source. Specifier resolution is the three
obvious candidates, `g`, `g.ts`, `g/index.ts`, against that map's keys. The
specification does not define a resolution algorithm, and does not need to:
J3's `→` is "`f` imports `g`, `g ∈ F`" for whatever resolution the host uses.
A conformance fixture therefore never depends on a resolution subtlety.

## No isolation mode

`ι` is always `open`. **F-IsolatedRefusal** distinguishes a mode in which
resolving a binding would import or invoke project code, and this package
never imports or invokes anything: every call it admits is J1's project-local
call, which F-IsolatedRefusal explicitly does not restrict. The mode is
therefore unobservable here, not unimplemented.
