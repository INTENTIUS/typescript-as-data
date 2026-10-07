---
title: "What it enables"
description: "Three claims for infrastructure written in TypeScript: checked before anything runs, adopt what you already have, and drift lands on the line you wrote."
weight: 10
---

chant writes typed resources for the three large clouds and Kubernetes through one pattern. It reads them as data rather than executing them, checks them as a graph before anything is emitted, and compiles them to each target's own artifact. CDK, Pulumi and cdk8s have typed resources too. Each of them has to run the program before there is anything to check.

The three claims listed below are one loop. You bring in what you already run, every change to it is checked before any of your code runs, and when the live estate drifts the report points back at the line that set the field.

Each page says what the claim is, who has it today and where the rule that states it lives, and ends on the one thing it does not establish.

All three rest on one mechanism, listed last. The build takes the values from the source without executing any statement your file wrote. [Its page](/typescript-as-data/what-it-enables/no-execution/) has the profiler recordings and the invocation count behind it, and the specification is the citation. If a term is new, [the glossary](/typescript-as-data/glossary/) has it.
