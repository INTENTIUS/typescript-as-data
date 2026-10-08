---
title: "Checked before anything runs"
description: "A pull request you have not reviewed can be built and checked without running its code."
weight: 1
aliases: ["/what-it-enables/rules-over-values/", "/what-it-enables/no-execution/"]
---

Someone outside your team opens a pull request that changes `governance.ts`. To show you what it would deploy, CDK or Pulumi has to run the code it brought. This build reads the file instead, so it can answer before you merge. The editor also flags a line that stops a file being data as you type it.

Checks then run on the values. Each setting can be fine on its own while the combination is wrong: pull-request reviews required with zero approvals, or a plan that deletes three of your four variables. A type checker sees one field at a time and misses both.

## Try it

Paste this to an agent, or run the two commands yourself.

```text
Clone https://github.com/INTENTIUS/typescript-as-data. Confirm Docker is
running and Node 22 or later is installed. Run `just smoke no-execution` and
explain each SMOKE line. Then run `BREAK=1 just smoke no-execution` and
report the "caught" line.
```

The policy writes a marker file at top level. Reading it produces the plan without creating the marker. Under `BREAK=1` the same file is run, and the marker appears. `just smoke rules-over-values` shows a check on values blocking a plan that would delete too much.

## The limit

Library code your file imports still runs, and so does a factory your project wrote without registering it with the tool. A stricter mode refuses the second. A check also covers only the values one build produces. A different build parameter gives a different estate.

The rules are in [`grammar.md`](https://github.com/INTENTIUS/typescript-as-data/blob/main/spec/grammar.md), [`observables.md`](https://github.com/INTENTIUS/typescript-as-data/blob/main/spec/observables.md) and [`rules.md`](https://github.com/INTENTIUS/typescript-as-data/blob/main/spec/rules.md).
