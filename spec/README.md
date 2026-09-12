# spec/

The normative specification, at the version `VERSION` names. Nine files, one rule set.

The normative files, in reading order: [`grammar.md`](./grammar.md) (`S-*`),
[`judgments.md`](./judgments.md) (`F-*`: J1 evaluation, J2 verdict, J3 taint,
J4 properties and observables), [`values.md`](./values.md) (`F-Val-*`),
[`divergence.md`](./divergence.md) (`F-Direction`, `F-Div-*`, `F-Exc-*`),
[`hosts.md`](./hosts.md) (`F-Host-*`), [`rules.md`](./rules.md)
(`F-Rule-*`). Each ends with a non-normative
Rationale section. [`inventory.md`](./inventory.md) is the coverage ledger.
Every decision point in chant core cites the rule that governs it, and #44
gates on it. [`prior-art.md`](./prior-art.md) is the #31 finding.

`requirements.md` was the provisional "why" layer and was retired by #46; its
content is the Rationale sections.

## Process rules for the specification itself

Not rules of the mechanism; rules of this document set. No fixture cites them. CI structure enforces them (#8, #44).

- **Every normative rule carries a stable identifier**(#6, #46).
- **Every identifier is exercised by at least one fixture, and every fixture
   cites a real identifier.**Both directions, in CI (#8, #44).
- **Rejections are located**- node and rule, wording unconstrained. Message stability is not normative (R9.4).
- **The subset is versioned**(#18). The policy is the Versioning section below; the current version is `VERSION` and the history is `CHANGELOG.md`.

**A disagreement between two implementations is triaged here first** (#25),
and reclassified as an implementation bug only once this specification is
shown to be unambiguous on the point. The order is the rule because the
incentives run against it: amending an implementation takes an afternoon and
amending a specification takes a decision, so the cheap label is the one most
likely to be wrong. A disagreement that survives triage is recorded with the
issue that will settle it, and the record may only shrink. This has been the
working practice since the first cross-check and was written down nowhere.

**A difference a missing capability explains is not a disagreement.** Where one
implementation has no answer to give, for want of a host or of a form it does
not implement, the difference is counted under a named limit and reported
apart from the agreement figure. Folding it into drift overstates what the comparison
established, in the direction that flatters this document. The corpus
cross-check names two such limits and counts each of them.

## Ownership, this repository is normative; chant implements it

Decided 2026-09-10 (#33). The subset is defined here. chant's
`packages/core/src/fold/subset.ts`, which currently calls itself "the single
canonical definition of chant's statically-foldable expression subset", is an
implementation of this specification, and its module documentation will say
so and cite the rule identifiers it implements (chant-side issue filed from
#33).

**A subset change goes spec-first.** The rule is proposed and landed here -
grammar, judgment, or value-domain text with an identifier and a fixture -
then implemented in chant citing that identifier, then released. The
specification version chant declares (#18) moves with it.

**The provisional path**, for a change chant needs before the spec can be
written properly: chant may ship it with the affected rule marked
*provisional* in `subset.ts`'s module doc, naming the issue here that will
specify it. A provisional marker may survive at most one chant release; the
docs-parity gate on chant's side (#34) fails on one older than that. A
provisional change is not conformance-tested until the rule exists here, and
chant's documentation may not describe it as supported until then.

**What this costs chant**, stated so it is accepted rather than discovered:
the subset can no longer change by editing code and a comment. That is the
price of the paper being able to call this a specification, and of the
conformance suite testing chant against a document chant cannot invalidate
by itself.

## Versioning (#18)

**A version names a set of rules.** It is the `S-*` and `F-*` identifiers
and their normative text at a point in time, recorded in
[`VERSION`](./VERSION) as `major.minor` and tagged `spec-<major>.<minor>`
on the commit that set it. It is not a chant release: chant declares which
specification version it implements, and the two move separately. It is not
a revision of the rationale, the inventory, a note or a fixture, none of
which is normative; a change confined to those does not move the version
and is not entered in [`CHANGELOG.md`](./CHANGELOG.md).

**Four kinds of change, two of them breaking.** A rule is *added* or
*widened* when source that did not fold now does; the minor version moves,
existing source is unaffected, and an implementation claiming the new
version must implement the rule. A rule is *narrowed* when source that
folded no longer does, or a verdict changes; the major version moves,
because a project that folded under the old version may not under the new.
A rule is *retired* when it is struck through in place with a note naming
its successor (the identifier rules above); that is also major, and the
fixtures citing it move to the successor in the same change, which the
coverage gate enforces, since a struck identifier is no longer defined and
a citation of it fails.

**Two profiles, and a fixture knows which it belongs to.** `judgments.md`
defines `full` and `data-host` (F-Profile, F-Profile-DataHost); the second is
the first with nothing that needs a JavaScript runtime, for an evaluator
embedded in a platform written in another language. Fixtures carry profile
tags, and the suite judges an implementation on its own profile's fixtures
only.

**An implementation declares the version it implements.** The conformance
adapter carries `specVersion`, and the suite compares the reference
implementation's declaration against `VERSION` so the two cannot drift
apart unnoticed. chant declares its version in its own tree (#34's gate is
where a stale declaration is caught); an implementation that declares none
is reported as such, not assumed current.

**What the paper cites** is one version, by tag, and the artifact is this
repository at that tag (`paper/README.md`). Numbers in the paper that
depend on the rule set say which version produced them.

**How a change is proposed.** As an issue here labelled `area:spec` that
carries the rule text with its identifier and the fixture that would pin it.
It lands spec-first and then in implementations, as the ownership section
says. The one exception is chant's provisional path above, which a release
bounds. Anyone may propose. The decision is recorded on the issue and dated
in the text, as the decisions above are.

## Scope, what the name claims, and what it does not

### The name overclaims

This section is the correction. "typescript-as-data"
names a general idea; what is specified here is one statically evaluable subset
of TypeScript, the one chant's fold mechanism implements, together with what
happens at its edge. It is not a claim that this is *the* way to read
TypeScript as data.

### Fixed to TypeScript

The syntax is the TypeScript AST as the `typescript`
compiler package parses it; the module system is ES modules; and the semantics
of every admitted operator are ECMAScript's, stated per operator in
`requirements.md` R10 because a second implementation in another language must
reproduce ECMAScript coercion rather than its host's. Two places depart from
ECMAScript on purpose (R10.2, R10.6) and are stated as departures.

### Varies by host

A host supplies four things.

- the constructors that build opaque entities
- the calls that fold, and the rule admitting each
- the tagged templates that are intrinsics
- how an entity exposes attributes as symbolic references

Those four are the host-hook interface
(`requirements.md` R7, issue #16), and chant's lexicons are one instantiation
of it. The generality this buys is generality over **host vocabularies**, not
over languages. A reader who infers language portability from "parameterized
by a host" has been misled, and the specification should not let them.

### What another language would reuse

Reusable as stated:

- the value-domain shape (R1)
- the per-file decision and identity-taint fixpoint (R4, R5)
- the two-layer admissibility structure (R6)
- the three evaluation modes (R7)
- the conformance obligations

To be reproduced rather than reused: the AST classification, which is
TypeScript's node kinds, and ECMAScript coercion (R10).

### What the reference implementation covers

The reference implementation covers J1, J2, J3 and revival through a host's
real constructors (#60, #64), and declares the `full` profile at the version
in `VERSION`. With an empty host it is also an implementation of `data-host`
without `new`, and the suite judges it on that profile's fixtures too. What it
does not cover is `packages/reference/CAVEATS.md`; the composite factory form
and isolation mode are the two that cost fixtures. A partial reference
implementation is fine; a reader assuming it is complete is not, which is why
this paragraph is here.


## Identifiers (#6)

Every normative rule carries an identifier. Two families, and the family is
part of the meaning:

- **`S-*`**, a *shape* rule: decidable from syntax alone, by a classifier
  with no binding resolver and no registry. Lives in `grammar.md`. An `S-`
  rule may accept what an `F-` rule later rejects; never the reverse
  (`F-Direction`).
- **`F-*`**, a *fold* rule. It cannot be decided from syntax alone. Its sub-prefix names the file that owns it.

| Prefix | Owner |
|---|---|
| `F-Eval-` | judgments.md J1 |
| bare `F-` | judgments.md J2 and J3 |
| `F-Obs-`, `F-NoOwnExecution`, `F-Depth` | judgments.md J4 |
| `F-Val-` | values.md |
| `F-Div-`, `F-Exc-`, `F-Direction` | divergence.md |
| `F-Host-` | hosts.md |
| `F-Rule-` | rules.md |

Names are `Prefix-CamelWords`, no digits in the name part, specific enough to
read alone (`F-Eval-Member`, not `F-Eval-3`). A rule with numbered steps is
cited as `F-Eval-Member step 4`; the step number is not part of the
identifier.

**Stability.** An identifier names one rule for the life of the spec. A rule
that is split keeps its identifier on the part closest to its original
meaning and the new part gets a new one. A rule that is removed or renamed
is struck through in place with a note naming its successor; the identifier
is never reused. Inventory row identifiers (`L3.10`) follow the same rule.

**Enforcement.** `spec/coverage.test.ts` (#44) asserts every inventory row
cites a defined rule. The reverse, every defined rule has a conformance
fixture, is #8's gate. Together they make an identifier that nothing
exercises, or a citation of nothing, a CI failure rather than a drift.

**Decided 2026-09-10 (#46).** One vocabulary at the end. `S-*`/`F-*` are the
only normative identifiers. `requirements.md`'s `R*` clauses are the
provisional "why" layer and are retired in a single migration once the rule
files exist (#13, #14, #16, #17, #39): each clause's rationale becomes a
non-normative note under the rule that discharges it, the objective becomes
`judgments.md`'s preamble, the four requirements-on-the-spec become process
rules in this README, and `inventory.md` is re-cited to rules only. `R*` is retired and
`inventory.md` cites `S-*`/`F-*` only.
