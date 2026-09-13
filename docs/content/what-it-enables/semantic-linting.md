---
title: "Semantic linting"
description: "A check over the declared values, across resources, whose findings are data a person or an agent can act on."
weight: 2
diataxis: explanation
---

The editor catches a misspelt key and a value of the wrong kind as you type. That is TypeScript's type checker, and it is worth having, but it is not linting. A type can say a field is a number in a range. It cannot say that `requirePullRequestReviews: true` with `requiredApprovingReviewCount: 0` is a contradiction, or that an owned org has no branch protection on its default branch, because those are conditions over the values, and over several resources at once.

Semantic linting is a check over the values a project declares. Folding is what makes it possible before anything is emitted: a rule receives the actual values of every file in the build, without running anything, and the same rule over the same data runs in CI and in a tool that folds as you edit.

A finding is data, not a message. It names the rule that fired, the subject it fired on, a path into the value and the source line it came from, with a severity. That shape is what makes a finding actionable, by a person reading it or by an agent asked to fix it: an assistant handed the finding knows which rule, which value and which line, and can propose the edit. The contract fixes the shape so that every host's findings look the same.

## Two phases

Pre-synthesis rules run over the folded values, per file or across the build, before serialization. Post-synthesis rules run over the emitted artifact. Both are pure functions of their input, with no execution and no environment, which is what lets them run anywhere the fold does.

## Who has it today

chant's lexicons carry semantic lint rules for each target, running over folded values. The AWS lexicon knows which resource combinations are incoherent and the Kubernetes lexicon knows a container's hardening rules. forgejo-warden runs both phases without calling them that. Its config loader validates the declared policy with the exact field path on a bad shape, and its guardrails (`removalDeltaCap`, `adminFloor`) run over the computed plan before any apply.

## Where the rule lives

Evaluability, "is this file data", is already specified as the `S-*` classifier and `F-Div-*`. The contract for semantic rules over values, `F-Rule-*`, is [`rules.md`](/typescript-as-data/spec/normative/rules/) since spec `1.4`. It fixes the input a rule sees and its purity, along with its findings and the two phases, and each of its six rules has a fixture whose expectation is a set of findings as data.
