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

One limit remains.

`{__compositeStep}` has its fate since #109: revival resolves the composite
through the module layer's F-Call and reads `.step` off the real result. An
expression-level fold has no module layer, so there it still rejects.

Revival can only construct what a host supplies. With `EMPTY_HOST` an envelope
has no class to become and revival rejects, which is correct rather than
silent: a build that folds a resource and cannot revive it has not folded the
file. Conformance fixtures name the host they need.

## The composite factory form, and what F-Call does not do

F-Call is implemented (#109, #110): a registered project composite is
interpreted under S-FactoryParams and S-FactoryBody against its defining
module's scope; a host-bound export at a declarator, reached directly,
through a const alias or as the declarator's direct argument, is invoked once
per call site with the resolved arguments, and whatever it returns is the
value. A package call anywhere else, nested inside an expression, is J1's
rejection, which is what chant does too. What F-Call does not do here is
step 6 for a *project* module: this package never imports project code, so
in open mode a registered composite that step 4 cannot interpret runs for
want of the invocation chant would perform.

## Isolation is observable at one step

`Host.isolation` is `open` or `isolated`, and a project fixture asks for one
with its `mode`. The one place the two differ here is F-Call step 5: a
registered project composite that step 4 cannot interpret is
**F-IsolatedRefusal** under `isolated`, and under `open` the file runs too,
because step 6 would import and invoke the project module and this package
never imports project code. So `open` is the mode this package cannot
answer in full, not `isolated`: a fixture whose fold depends on step 6 has no
verdict here, and F-Obs-Counters' `projectFactoryInvocations` is zero in
either mode.
