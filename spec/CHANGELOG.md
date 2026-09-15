# Changelog

The versioned history of the rule set. The policy is in [`README.md`](./README.md) under "Versioning". A version names a set of rules, `S-*` and `F-*` with their normative text, and nothing else: not a chant release, not a revision of the rationale. The current version is the single line in [`VERSION`](./VERSION).

Each entry lists the rules that changed and how in the four kinds the policy defines. A change confined to non-normative text is not versioned and is not listed here; the rationale sections and the inventory are the usual cases.

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
