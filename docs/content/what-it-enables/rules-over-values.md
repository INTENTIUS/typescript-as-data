---
title: "Rules over values"
description: "A rule sees the declared values of every file before anything is emitted, with nothing run, and its findings are data."
weight: 2
diataxis: explanation
---

You set `requirePullRequestReviews: true` and `requiredApprovingReviewCount: 0` in the same block. Those contradict each other. Nothing tells you, because each one is fine on its own and the type checker only ever sees them one at a time.

A check that reads the values catches it. It can also catch what no single file shows on its own: an org you own with no branch protection on its default branch, or a plan that would delete three of the four variables you have.

That kind of check is what this page is about. It runs before anything is built, it sees what every file declares, and none of your code runs to produce what it sees.

## What the fold adds

Checks that read the finished YAML are ordinary. Any tool that emits YAML can run one, and nothing here is needed for it.

The useful ones run earlier, on the values themselves, before a line of YAML exists. That is what folding makes possible. The values are already there without running your files, so the check is a plain function of your source and runs anywhere the fold runs, your editor included.

It also sees things the finished YAML has lost. A reference is still a reference rather than a copied string, and one resource is still one resource wherever it appears. The answer is the same whether the file folded or had to be run.

What a check reports is fixed too. Every finding carries:

- which rule fired
- what it fired on
- where in the value
- how bad it is
- the source line, when the tool tracks that

Enough for a person to act on. Enough for an agent asked to fix it to find the edit.

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

## What it does not establish

A check sees the values one build produces. Change a build parameter and you get a different estate, which the check has said nothing about. It proves things about the estate in front of it rather than about every estate your source could produce.

## Where the rule lives

Evaluability, "is this file data", is the `S-*` classifier and `F-Div-*`. The contract for rules over values, `F-Rule-*`, is [`rules.md`](/typescript-as-data/spec/normative/rules/) since spec `1.4`. It fixes the input a rule sees and its purity, along with its findings and the two phases, and each of its six rules has a fixture whose expectation is a set of findings as data.
