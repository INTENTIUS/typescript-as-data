# spec/

The normative specification. Empty until the epics below land.

Planned files, one per issue:

- `grammar.md` — surface syntax of the subset
- `judgments.md` — expression evaluation, the per-file fold-or-run decision,
  and the identity-taint fixpoint over the module graph
- `hosts.md` — the host-hook interface the subset is parameterized over
- `divergence.md` — where a shape-only classifier and a resolving evaluator may
  disagree, and in which direction
- `conformance.md` — how the suite discharges the claims above
- `CHANGELOG.md` — the subset moves; the spec is versioned

Every normative rule carries an identifier (`S-*` for shape, `F-*` for fold and
file-level decisions). CI asserts every identifier is exercised by at least one
conformance test and that every test cites a real identifier.
