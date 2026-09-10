# spec/

The normative specification. Empty until the epics below land.

Two files exist ahead of the normative text, neither of them normative:

- [`inventory.md`](./inventory.md) — every decision point in chant core's fold
  path, with the requirement that covers it or a GAP marker. 99 rows, 58 with
  gaps. This is the coverage ledger; #44 gates on it.
- [`requirements.md`](./requirements.md) — what the normative text has to pin
  down. Currently incomplete and partly wrong; see its status block.

Write the files below against both.

## Scope — what the name claims, and what it does not

**The name overclaims, and this paragraph is the correction.** "typescript-as-data"
names a general idea; what is specified here is one statically evaluable subset
of TypeScript, the one chant's fold mechanism implements, together with what
happens at its edge. It is not a claim that this is *the* way to read
TypeScript as data.

**Fixed to TypeScript.** The syntax is the TypeScript AST as the `typescript`
compiler package parses it; the module system is ES modules; and the semantics
of every admitted operator are ECMAScript's, stated per operator in
`requirements.md` R10 because a second implementation in another language must
reproduce ECMAScript coercion rather than its host's. Two places depart from
ECMAScript on purpose (R10.2, R10.6) and are stated as departures.

**Varies by host.** Which constructors build opaque entities, which calls fold
and by what rule, which tagged templates are intrinsics, and how an entity
exposes attributes as symbolic references. That is the host-hook interface
(`requirements.md` R7, issue #16), and chant's lexicons are one instantiation
of it. The generality this buys is generality over **host vocabularies** — not
over languages. A reader who infers language portability from "parameterized
by a host" has been misled, and the specification should not let them.

**What an implementer in another language would reuse and what they would not.**
Reusable as stated: the value-domain shape (R1), the per-file decision and
identity-taint fixpoint (R4, R5), the two-layer admissibility structure (R6),
the three evaluation modes (R7), and the conformance obligations. To be
reproduced rather than reused: the AST classification (which is TypeScript's
node kinds) and ECMAScript coercion (R10).

**What the reference implementation covers.** Per issue #3's re-cut for the
paper: at submission time the reference implementation implements the
expression layer and the host-hook interface, and does **not** implement the
module layer or the identity-taint fixpoint. Those are carried by the judgment
text and validated against chant with the differential corpus. A partial
reference implementation is fine; a reader assuming it is complete is not,
which is why this sentence is here.

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
