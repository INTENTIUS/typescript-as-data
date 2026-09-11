# @intentius/tsad-reference

A reference implementation of the specification in `spec/`. It covers the
expression layer: the `S-*` productions of `grammar.md` §2 and the `F-Eval-*`
rules of `judgments.md` J1, over the value domain of `values.md`.

## What it implements, and what it does not

Implemented: shape classification, expression evaluation, the value domain's
envelope shapes, and the host interface's registry, helper allowlist and
owned-specifier prefixes (`F-Host-Interface` items 3, 4 and 5).

Not implemented: the module layer and the identity-taint fixpoint (J2, J3), so
`externals` is only ever what a caller supplies and no `FoldableFunction` is
ever produced. Tracked as #21 and #22. Items 1, 2 and 6 of the host interface
belong to revival and interpretation and are absent for the same reason.

## Provenance

From #19 until #50 these files were a *port* of chant's, kept current by a
sync script and a list of recorded cuts. That guaranteed agreement and made
agreement uninformative: the cross-check was comparing the same code with
itself. #50 replaced the ported evaluation layer with one written from the
specification text.

**One honest limit on how independent that is.** The author of the rewrite had
previously read chant's implementation closely, while writing the
specification from it. The rewrite was done from `grammar.md` and
`judgments.md` without consulting the source, but it is not the test a reader
who had never seen chant would constitute. What it does establish is that the
specification text is complete enough to implement from, and it found one
place where it was not: `spec/grammar.md`'s definition of an *unclaimed*
callee, which four normative sentences used and none defined (#51).

The cut list and the sync script are in git history at the commit that removed
them, as the record of what the host interface was derived from.
