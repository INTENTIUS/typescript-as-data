---
title: "What it does not do"
description: "A summary of packages/reference/CAVEATS.md, the record of what the reference implementation cannot answer."
weight: 2
aliases: ["/reference/limits/"]
---

`packages/reference/CAVEATS.md` is the source of truth for this page. It is
where the reference implementation records what the specification asks for and
the package cannot supply. What follows is a summary; read the file for the
full statement of each item.

The reference is written from `spec/` and nothing else. Where the specification
is silent, ambiguous, or asks for something the package cannot supply, the gap
goes in `CAVEATS.md`. The list has shrunk as the corpus cross-check found
things: the composite factory form was the largest gap once, and is implemented
since #109.

## It never runs project code

This is the one gap left, and it is a design choice.
The package never imports or invokes a project module. Two places in the
specification ask for that, and get `run` or `unavailable` here instead.

- F-Call step 6 in open mode. A registered project composite that step 4
  cannot interpret would be imported and invoked, which chant does; here the
  file runs. Under `isolated` the same file is `F-IsolatedRefusal`, so `open`
  is the mode this package cannot answer in full.
- The `executing` mode. A declared project function whose body cannot fold
  would be invoked. The adapter answers `unavailable` for a project judged
  under it.

F-Obs-Counters' `projectFactoryInvocations` is therefore zero in every mode.

## Revival needs a host

`F-Val-Fate` is implemented. A declarator's value is revived through the
folding file's own imports, so a `{__resource}` becomes a real instance of the
class the host supplies, `{__intrinsic}` and `{__helper}` are invoked, and
`{__symbol}` resolves as a dotted chain. `{__compositeStep}`
resolves through F-Call at the module layer; an expression-level fold has no
module layer, so there it still rejects.

Only what a host supplies can be constructed. With `EMPTY_HOST` an envelope
has no class to become and the attempt is rejected. `CAVEATS.md` calls that
the correct answer: a build that folds a resource and cannot revive it has not
folded the file. Conformance fixtures therefore name the host they
need, and the named hosts live in `packages/conformance/src/host.ts`.

## No filesystem and no module resolution algorithm

`foldProject` takes a map of path to source. Specifier resolution is the three
candidates `g`, `g.ts` and `g/index.ts`, against that map's keys, with
`..` segments resolved.

`CAVEATS.md` argues this is not a shortfall: the specification does not define
a resolution algorithm and does not need to, because J3's edge relation is
"`f` imports `g`, `g ∈ F`" for whatever resolution the host uses. A conformance
fixture consequently never depends on a resolution subtlety.

## One entry that is a pointer

`CAVEATS.md` opens with the two identity predicates, which were a genuine
ambiguity and are now resolved in the specification by `F-Identity`. The rule
names the entity test and the reference test, says the entity test is the
normative one, and says `F-Import` over-approximates on purpose.

The entry stays in `CAVEATS.md` because the code comments cite `F-Identity`,
and a reader of an older revision of the specification will not find it.

## How the gaps are accounted for

None of these gaps is allowed to be reported as a disagreement. The rule in
`spec/README.md` is that a difference which a missing capability explains is
counted under a named limit and reported apart from the agreement figure.
Folding it into drift overstates what the comparison established.

The corpus cross-check's two limits are this page's gaps counted that way:
`host`, a package the host could not load, and `invocation`, a declarator call
the reference would have to invoke.
