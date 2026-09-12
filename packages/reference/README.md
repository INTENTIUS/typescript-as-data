# @intentius/tsad-reference

A reference implementation of the specification in `spec/`, written from the
specification text and nothing else (#50).

## What it implements, and what it does not

Implemented: shape classification, expression evaluation (J1), the per-file
verdict and the identity-taint fixpoint (J2, J3, since #60), revival through
a host's real constructors (F-Val-Fate, since #64), and the host interface's
registry, helper allowlist, owned-specifier prefixes and values. It declares
the specification version it implements (`specVersion` on its adapter), and
the suite holds that to `spec/VERSION`.

Not implemented, with the reason for each: `CAVEATS.md`. Isolation mode is
the one that costs fixtures.

## As a package

`@intentius/tsad-reference` depends on `@intentius/tsad-conformance` for the
adapter and host types only. Its major and minor are the specification version
it implements; the patch is its own.

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
