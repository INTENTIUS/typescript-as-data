# What the reference implementation does not do, and what it found

This package is written from `spec/` and nothing else (#50). Where the
specification is silent, ambiguous, or asks for something the package cannot
supply, the gap is recorded here rather than papered over in the code.

## Two identity predicates, never reconciled

J2's **F-Import** tests a captured value for identity with "`typeof` object
**or function**". J4's **F-Val-Live** tests for "a prototype other than
`Object` or `Array`, or a function". A plain `{ a: 1 }` satisfies the first
and not the second.

Both appear deliberate. The broad test is right for an import capture: two
files holding one shared plain object still disagree about which copy is the
build's, so the capture edge has to exist. The narrow test is right for
F-CallLeak: a helper that takes a parameter and returns computed plain data
taints nothing, and a narrower predicate is what keeps it from doing so.

The specification states both and never says they are different tests for
different questions. This implementation uses F-Import's predicate for import
and re-export captures and F-Val-Live's for call leaks, which reproduces the
intent; a reader of the specification alone could implement either one twice
and be wrong in one of two directions. Filed as #59.

## No revival

**F-Val-Fate** has a resource envelope revived into a real instance by the
class the declarator's `new` resolves to. Revival needs a host that supplies
real constructors; this package ships `EMPTY_HOST`, so a `{__resource}`
envelope stays an envelope in the namespace.

This does not change a verdict. F-Import asks only whether a value has
identity, and an envelope is an object either way. It does change two things:
a project fixture cannot assert a revived instance's class, and **F-CallLeak**
is not reachable at all, because no body this package can evaluate produces a
value that F-Val-Live calls live. That is why F-CallLeak is still listed in
`spec/fixtures/UNCOVERED.md` with a reason of its own.

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
