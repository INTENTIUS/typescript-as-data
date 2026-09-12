---
title: "Semantic linting"
description: "The same check at the keystroke and in CI, over real values, across resources."
weight: 2
diataxis: explanation
---

A syntax linter sees tokens, so it can tell you a key is misspelt. What it cannot tell you is that `requirePullRequestReviews: true` with `requiredApprovingReviewCount: 0` is a contradiction, because the values are not known to it. A configuration language with constraints in the type can check one field's range, and still cannot check a relationship between two resources.

Folding gives a rule the actual values, of every file in the build, before anything is emitted. So a rule can say "an owned org with no branch protection on its default branch" and be right, and can say it in the editor, because the values are known without running anything. The check at the keystroke is the check in CI, over the same data, because the data is a function of the source.

## Two phases

Pre-synthesis rules run over the folded values, per file or across the build, before serialization. Post-synthesis rules run over the emitted artifact. Both are pure functions of their input, with no execution and no environment, which is what lets them run in an editor. A finding names a rule, a path into the value, and the source line it came from.

## Who has it today

chant's lexicons carry semantic lint rules for each target, running over folded values. The AWS lexicon knows which resource combinations are incoherent and the Kubernetes lexicon knows a container's hardening rules. forgejo-warden runs both phases without calling them that. Its config loader validates the declared policy with the exact field path on a bad shape, and its guardrails (`removalDeltaCap`, `adminFloor`) run over the computed plan before any apply.

## Where the rule lives

Evaluability, "is this file data", is already specified as the `S-*` classifier and `F-Div-*`. The contract for semantic rules over values, `F-Rule-*`, is [issue #79](https://github.com/INTENTIUS/typescript-as-data/issues/79). It fixes the input a rule sees and its purity, along with its located findings and the two phases. It is stated here as a forward reference rather than a claim.
