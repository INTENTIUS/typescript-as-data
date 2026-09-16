# Changelog

The versioned history of the rule set. The policy is in [`README.md`](./README.md) under "Versioning". A version names a set of rules, `S-*` and `F-*` with their normative text, and nothing else: not a chant release, not a revision of the rationale. The current version is the single line in [`VERSION`](./VERSION).

Each entry lists the rules that changed and how in the four kinds the policy defines. A change confined to non-normative text is not versioned and is not listed here; the rationale sections and the inventory are the usual cases.

## 2.1, 2026-09-14

**Added. `F-Host-Interface` item 1.** An entity constructor holds its props
and exposes the attributes `attrMap` names. It does no more. Validation and
normalization move to a rule. F-Rule-Pure already constrains the code and
F-Rule-Finding already carries the result to the author.

Item 1 named what an entity *carries* and never what constructing one may
*do*, so a host could put a validating, graph-building constructor behind it
and violate no rule. Folding invokes that constructor through revival
(F-Val-Fate). Item 1 was the one place code runs during a fold with nothing
said about it: F-Host-Admission bounds an intrinsic and F-Rule-Pure bounds a
rule. #203 made F-Host-Admission's clause observable and left this
half of #173 open. This closes it.

The bound was already implicit in the construction form item 1 names. A class
built by `createResource(type, lexicon, attrMap)` is parameterised by a type
name, a lexicon name and an attribute map, and has nowhere to put arbitrary
work. chant conforms unchanged: `packages/core/src/runtime.ts` defines the
markers, stores `props`, and builds one `AttrRef` per `attrMap` entry.

**Why this is minor.** The four kinds are defined over source. Narrowed means
source that folded no longer does or a verdict changes. No source changes
verdict here. Under a conforming host every file that folded still folds; what
shrinks is the set of conforming *hosts*, which is an added obligation rather
than a narrowed rule. The policy did not name that axis when this landed.
`README.md` names it now and a host obligation moves the minor (#204).

## 2.0, 2026-09-14

**Narrowed. `F-Call` step 5.** Project-owned invocation moves behind `ι =
executing`. Under any other mode a declarator whose callee resolves to a
project file is `run` rather than imported and invoked at step 6. Source that
folded by that invocation no longer folds. That is why this is major.

The rule now matches the decision the specification had already taken.
`verdict.md` calls `open` the strict default and the rationale says of
`executing` that "it is never the default".
Step 2's project-owned invocation was moved behind `executing` at spec 1.8 and
chant followed at `chant-v0.72.3`; step 6 was the same path and had not moved.
`verdict.md`'s description of `open` is unchanged and is now true as written.

`F-NoOwnExecution` follows it. Its bounded list no longer carries an `open`
clause: what step 6 still invokes under `open` is a package's factory, which
`F-Host-Admission` governs, and the project-owned case is `executing`'s.

The reference implementation already behaved this way. `packages/reference`
never imports project code. `CAVEATS.md` recorded that as the one gap in its
coverage of `open`. The rule closes the gap rather than the package.

## 1.8, 2026-09-13

The first published rule set. Earlier versions exist as tags and were never released so this entry is the whole history a reader needs: the rules are the ones the files carry now.
