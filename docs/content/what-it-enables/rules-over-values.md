---
title: "Rules over values"
description: "A rule sees the declared values of every file before anything is emitted, with nothing run, and its findings are data."
weight: 2
diataxis: explanation
---

The editor catches a misspelt key and a value of the wrong kind as you type. That is TypeScript's type checker, worth having and not linting. A type can say a field is a number in a range, and no type can say that `requirePullRequestReviews: true` with `requiredApprovingReviewCount: 0` is a contradiction, or that an owned org has no branch protection on its default branch, because those are conditions over the values, and over several resources at once.

A rule over values is a check over what a project declares. The specification defines no such check. It defines the contract a host's checks run under, [`rules.md`](/typescript-as-data/spec/normative/rules/), which says what a check sees and when it runs, and then what a check may do and what a finding is. chant's lexicon rules and forgejo-warden's guardrails are checks; what they have in common is that contract.

## What the fold adds

There are two phases, and the fold matters to one of them.

A **post-synthesis** rule reads the emitted artifact. Any tool that emits YAML can run one, from a YAML source or a TypeScript one, and nothing about the fold is needed for it. The contract covers the phase because chant serves both phases from one hook, not because the specification enables it.

A **pre-synthesis** rule reads the declared values of every file in the build before anything is emitted, and that is the phase the fold enables. The values are there without running any project code, so the check is a pure function of the source and can run wherever the fold runs. They are the declared values and not the flattened artifact: a field that refers to another resource's attribute is still a reference at this point, an entity is still one entity wherever it is used, and a rule can say things about that structure which the artifact no longer shows. And the findings are the same whether the build folded the file or ran it, which the contract states as a property.

Beyond the phase, the contract fixes what a check reports. A finding names the rule that fired, the subject it fired on, a path into the value and a severity, and, where the host tracks provenance, the source line it came from. That shape is what makes a finding actionable by a person reading it or by an agent asked to fix it: an assistant handed the finding knows which rule and which value, and can propose the edit.

## See it hold

forgejo-warden's removal cap is a rule over values with a scenario behind it. Paste this to an agent, or type the two commands yourself.

```text
Clone https://github.com/INTENTIUS/typescript-as-data. Confirm Docker is
running (docker info) and Node 22 or later is installed. From the repo root
run `just smoke rules-over-values` and explain each SMOKE verdict line to me
as it prints. Then run `BREAK=1 just smoke rules-over-values` and report the
"caught" line: a plan that would remove three of four owned variables is
blocked by the removal cap before anything is applied.
```

The steps, in the order they print. Five owned variables exist on the org and the policy declares four; the plan removes one, which is under the cap, and it applies. Under `BREAK=1` the policy declares one and the plan would remove three of the four left; the guardrail blocks the apply with the fraction it computed, so all four variables are still there.

## Who has it today

chant's lexicons carry rules over values for each target, running over the folded values. The AWS lexicon knows which resource combinations are incoherent and the Kubernetes lexicon knows a container's hardening rules. forgejo-warden runs both phases without calling them that. Its config loader validates the declared policy with the exact field path on a bad shape, and its guardrails (`removalDeltaCap`, `adminFloor`) run over the computed plan before any apply.

## Where the rule lives

Evaluability, "is this file data", is the `S-*` classifier and `F-Div-*`. The contract for rules over values, `F-Rule-*`, is [`rules.md`](/typescript-as-data/spec/normative/rules/) since spec `1.4`. It fixes the input a rule sees and its purity, along with its findings and the two phases, and each of its six rules has a fixture whose expectation is a set of findings as data.
