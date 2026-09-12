---
title: "What it does not do"
description: "A summary of packages/reference/CAVEATS.md, the record of what the reference implementation cannot answer."
weight: 2
aliases: ["/reference/limits/"]
---

`packages/reference/CAVEATS.md` is the source of truth for this page. It is
where the reference implementation records what the specification asks for and
the package cannot supply, rather than papering the gap over in the code. What
follows is a summary; read the file for the full statement of each item.

The reference is written from `spec/` and nothing else. Where the specification
is silent, ambiguous, or asks for something the package cannot supply, the gap
goes in `CAVEATS.md`.

## The composite factory form

This is the largest gap, and it bounds the
[corpus cross-check](/typescript-as-data/spec/conformance/corpus/) more than
anything else does. The package has no composite factory form, so
`{__compositeStep}` has no fate. Reviving one would mean "resolve the
composite, then read `.step` off the real result", and with no factory form
the package rejects rather than guessing.

`CAVEATS.md` puts a number on it, taken from the corpus cross-check: 272 of
chant's 409 corpus files reach a composite factory call, directly or through a
file that does, and none of them can be compared until the package has the
form. That count lives in `packages/conformance/corpus-report.md`.

## Revival needs a host

`F-Val-Fate` is implemented. A declarator's value is revived through the
folding file's own imports, so a `{__resource}` becomes a real instance of the
class the host supplies, `{__intrinsic}` and `{__helper}` are invoked, and
`{__symbol}` resolves as a dotted chain. `{__attrRef}` passes through, and is
rejected inside a host call's arguments per `F-Val-Position`.

Only what a host supplies can be constructed. With `EMPTY_HOST` an envelope
has no class to become and the attempt is rejected, which `CAVEATS.md` calls
correct rather than silent: a build that folds a resource and cannot revive it has not
folded the file. Conformance fixtures therefore name the host they need, and
the named hosts live in `packages/conformance/src/host.ts`.

## No filesystem and no module resolution algorithm

`foldProject` takes a map of path to source. Specifier resolution is the three
obvious candidates, `g`, `g.ts` and `g/index.ts`, against that map's keys.

`CAVEATS.md` argues this is not a shortfall: the specification does not define
a resolution algorithm and does not need to, because J3's edge relation is
"`f` imports `g`, `g ∈ F`" for whatever resolution the host uses. A conformance
fixture consequently never depends on a resolution subtlety.

## No isolation mode

`ι` is always `open`. `F-IsolatedRefusal` distinguishes a mode in which
resolving a binding would import or invoke project code, and this package never
imports or invokes anything: every call it admits is J1's project-local call,
which `F-IsolatedRefusal` explicitly does not restrict. `CAVEATS.md` describes
the mode as unobservable here rather than unimplemented.

## Two items that the corpus found

Two entries in `CAVEATS.md` are records of things the cross-check turned up
once the reference was given a real host, and both are now implemented.

`F-Capture` is decided over the produced namespace, and the walk that decides
it descends through an entity's own data properties, enumerable or not, and
through a `WeakRef` to what it holds. chant's entity classes keep their props
on a non-enumerable property and an attribute reference keeps its entity behind
a `WeakRef`, so a walk over `Object.values` records no capture for two ordinary
cases: a shared object passed to a constructor, and an output built from
another file's attribute. Neither was visible until the corpus ran against a
real host, because with `EMPTY_HOST` an entity never becomes an instance.
Accessors are skipped rather than invoked, since one of chant's throws when
read too early.

`F-Prebuild` is implemented. Every top-level `const n = new T(…)` is
constructed once in source order, before any declarator is evaluated, and a
reference to it reads that instance. The package originally rejected such a
reference, which was the reading `F-Eval-Ident` step 1 licensed before the rule
existed, and the corpus found twelve chant examples that fold the shape.

## One entry that is a pointer rather than a gap

`CAVEATS.md` opens with the two identity predicates, which were a genuine
ambiguity and are now resolved in the specification by `F-Identity`. The rule
names the entity test and the reference test, says the entity test is the
normative one, and says `F-Import` over-approximates on purpose. The package
follows it, using the reference test for import and re-export captures and the
entity test for call leaks. The entry stays in `CAVEATS.md` because the code comments
cite `F-Identity` and a reader of an older revision of the specification will
not find it.

## How the gaps are accounted for

None of these gaps is allowed to be reported as a disagreement. The rule in `spec/README.md` is that a difference which a missing capability
explains is counted under a named limit and reported apart from the agreement
figure, because folding it into drift overstates what the comparison
established, in the direction that flatters the specification. Two of the corpus cross-check's four
limits, `composite` and `host`, are this page's gaps counted that way.
