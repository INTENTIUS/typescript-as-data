---
title: "Checked before anything runs"
description: "The editor and the build check a configuration from its source, so a pull request you have not reviewed yet can be built without running its code."
weight: 1
diataxis: explanation
aliases: ["/what-it-enables/rules-over-values/"]
---

Someone outside your team opens a pull request that changes `governance.ts`. You want the build to tell you what it would deploy before you merge it. A tool that executes the program, such as CDK or Pulumi, builds that pull request by running the code it brought on a machine you own.

Here the build reads the file instead. Your own statements are never executed to find out what the file declares. The same reading runs in the editor, so most of what a reviewer would catch is flagged at the keystroke by the author.

## At the keystroke

Nobody has to think about folding to use it. They meet it as a lint. The editor says whether the file is data and points at the line that makes it not data. That lint is the shape classifier of the grammar, and it needs no evaluator.

A tool that executes your program cannot offer this. Until the program has run there is nothing to check, so the earliest such a tool can answer is after the execution has happened. `cdk synth` learns what an app builds by constructing it.

## A pull request you have not reviewed

The build folds every file it can. A file that computes its values in a loop or calls out to something cannot be read this way, and it is run instead. You are told which files those were, and the classifier can name them from the syntax before the build starts. chant runs such a file in a sandbox, one file at a time, so nothing from the project's source is imported into its own process.

One gap remains in the normal mode. A factory your own project wrote and never registered with the tool is called during the fold. A stricter mode refuses that call, and the file is reported as one that runs.

## Three questions

In 2019 Ryan Cavanaugh of the TypeScript team turned down executable configuration files. He wrote that it "opens up an enormous can of worms (is it safe to run this? what dependencies does the config file have? what does the config file assume about its environment?)". Each of the three questions has a rule here.

| Question | The answer here |
|---|---|
| Is it safe to run? | The fold runs none of the statements your file wrote. What does run is a short closed list, mostly factories the packages you import publish. In the strict mode a fold that would need your project's code is refused, and the file is reported as one that runs. |
| What does it depend on? | An import is admitted only from a package the build has installed or a path inside the host's own module tree. Anything else stops the fold. |
| What does it assume about the environment? | A bare `process` is refused. The environment comes in only through build parameters the project declares, so a value can always say where it came from. |

The list of what may run is on [the mechanism page](/typescript-as-data/what-it-enables/no-execution/), with the measurement behind it.

## Rules over values

The deepest form of the check reads the values themselves. You set `requirePullRequestReviews: true` and `requiredApprovingReviewCount: 0` in the same block. Those contradict each other. Nothing tells you, because each one is fine on its own and the type checker only ever sees them one at a time.

A check that reads the values catches it. It can also catch what no single file shows on its own: an org you own with no branch protection on its default branch, or a plan that would delete three of the four variables you have.

Checks that read the finished YAML are ordinary. Any tool that emits YAML can run one. The useful ones run earlier, on the values, before a line of YAML exists. The values are already there without running your files, so the check is a plain function of your source and runs anywhere the fold runs, your editor included.

It also sees things the finished YAML has lost. A reference is still a reference rather than a copied string, and one resource is still one resource wherever it appears. A rule can follow that reference into another file. The answer is the same whether the file folded or had to be run.

What a check reports is data, so a person or an agent can act on it. Every finding carries:

- which rule fired
- what it fired on
- where in the value
- how bad it is
- the source line, when the tool tracks that

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

chant runs the evaluability lint at the keystroke and folds every file it can. Its lexicons carry rules over values for each target, running over the folded values. The AWS lexicon knows which resource combinations are incoherent and the Kubernetes lexicon knows a container's hardening rules. forgejo-warden runs both phases without calling them that. Its config loader validates the declared policy with the exact field path on a bad shape, and its guardrails (`removalDeltaCap`, `adminFloor`) run over the computed plan before any apply.

## What it does not establish

A check sees the values one build produces. Change a build parameter and you get a different estate, which the check has said nothing about. It proves things about the estate in front of it rather than about every estate your source could produce.

## Where the rule lives

Whether a file is data is the grammar's `S-*` classifier. The three questions map to rules in [the prior art](/typescript-as-data/spec/normative/prior-art/): what may run is bounded in `observables.md`, imports are decided by resolution in `hosts.md`, and the strict mode's refusal is in `verdict.md`. The contract for rules over values, `F-Rule-*`, is [`rules.md`](/typescript-as-data/spec/normative/rules/) since spec `1.4`. It fixes the input a rule sees and its purity, along with its findings and the two phases, and each of its rules has a fixture whose expectation is a set of findings as data.
