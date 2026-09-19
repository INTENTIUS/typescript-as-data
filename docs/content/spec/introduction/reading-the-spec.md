---
title: "Reading the specification"
description: "The reading order of the normative files, what each one owns, and the process rules that govern the document set."
weight: 3
aliases: ["/introduction/reading-the-spec/"]
---

`spec/README.md` gives a reading order. The files
are layered rather than alphabetical, each assuming the vocabulary the previous
one introduced.

## The reading order

**Start with [`objective.md`](/typescript-as-data/spec/normative/objective/).** It
states the objective the whole mechanism serves, names the two profiles an
implementation may claim, and carries the notation guide. That last part
matters if the judgments look like nothing you have read before. The guide is
non-normative and self-contained: it says what `⊢` and `⇓` and the bracket
pairs mean, with one worked reading of each shape, and a reader who has met
none of them can read every rule from it alone.

Then the rules, in order.

1. The `S-*` rules are [`grammar.md`](/typescript-as-data/spec/normative/grammar/),
   the statement gate and the expression productions, decidable from syntax
   alone. Every `F-*` rule is keyed to a production here.
2. J1 is [`evaluation.md`](/typescript-as-data/spec/normative/evaluation/), which owns
   `F-Eval-*` and takes one expression at a time.
3. J2 is [`verdict.md`](/typescript-as-data/spec/normative/verdict/), the per-file
   verdict: this file folds, or it runs and here is why.
4. J3 is [`taint.md`](/typescript-as-data/spec/normative/taint/), the identity-taint
   fixpoint, which decides a whole build rather than a file.
5. J4 is [`observables.md`](/typescript-as-data/spec/normative/observables/), the
   properties that are about the mechanism rather than about any one judgment.
6. The value domain is [`values.md`](/typescript-as-data/spec/normative/values/). It
   says what a fold produces: the closed union of cases a folded value can be,
   and the envelope shapes that stand in for what the build has not resolved
   yet.
7. Where the two consumers of the subset may disagree is
   [`divergence.md`](/typescript-as-data/spec/normative/divergence/). The shape
   classifier and the folder hold unequal information, and this file states the
   direction of any disagreement and enumerates every known one.
8. What a host supplies is [`hosts.md`](/typescript-as-data/spec/normative/hosts/):
   seven things, and the rule by which each is admitted.
9. The contract for a rule running over folded values is
   [`rules.md`](/typescript-as-data/spec/normative/rules/).

The rule text is deliberately terse.
[`rationale.md`](/typescript-as-data/spec/normative/rationale/) carries the reasoning
for all of them in one place, a note per rule family, and is not normative.

Three further files are not rule files.

[`inventory.md`](/typescript-as-data/spec/normative/inventory/) is the coverage ledger.
A decision point is anywhere the mechanism chooses between admitting and
rejecting, between evaluation modes, or between representations. There is one
row per decision point, derived from a complete read of chant core's fold path,
and the last column names the `S-*` or `F-*` rule that governs the row, or
`GAP` with an out-of-scope reason.

[`prior-art.md`](/typescript-as-data/spec/normative/prior-art/) is a survey rather
than a rule. Every neighbour that reaches a whole function or unit reaches it by
running the source. What the sweep found no precedent for is the combination of
per-file granularity with shared object identity across the boundary, which is
what forces J3.

[`changelog.md`](/typescript-as-data/spec/normative/changelog/) is the versioned
history of the rule set.

## The process rules

`spec/README.md` also carries rules about the document set rather than about
the mechanism. No fixture cites them; CI structure enforces them.

Every normative rule carries a stable identifier. Each identifier is exercised
by at least one fixture, and each fixture cites a real identifier, checked in
both directions in CI. Rejections are located, by node and rule, with the
wording unconstrained, because message stability is not normative.

`spec/README.md` is published as
[the specification index](/typescript-as-data/spec/normative/), and it is the shortest
route to the rest.
