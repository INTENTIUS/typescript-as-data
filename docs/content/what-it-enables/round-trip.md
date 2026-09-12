---
title: "Round-trip generation"
description: "Live state or an existing artifact becomes source that folds back to exactly what it came from."
weight: 3
diataxis: explanation
---

Folding goes one way, source to data, and a generator goes the other. Put them together and an existing artifact becomes TypeScript that folds back to exactly the data it came from, whether that artifact is a CloudFormation template, a live Kubernetes namespace or an org's current settings. The property is `fold(generate(v)) = v`.

## Why the language matters here

A YAML-to-YAML round trip is the identity and proves nothing. The reason to go through TypeScript is that the generator can decide what each value is. This string is a literal; that one is a reference to another resource's attribute, so write `bucket.Arn`; a third is a build parameter; a repetition across forty resources is one `const`, spread where it is used. Each decision needs a source form the subset can express and the fold can reverse. YAML cannot express the first three at all. TypeScript expresses all of them with object literals and constants, plus spreads and member access. The source it produces folds back to the exact artifact.

## Who has it today

chant has three generators through one pipeline. `chant import` reads a template file, `--from <env>` imports live through each lexicon's `exportResources()`, and carve-out reads Terraform. The Kubernetes lexicon carries a round-trip suite. forgejo-warden's reconcile direction is the same idea for an org, with live reality read back and diffed against declared source.

## Where the rule lives

The completeness half is [`F-Val-Source`](/typescript-as-data/spec/normative/values/), since spec `1.5`: a table with one source form per case of the value domain, each folding back by a rule the table cites. The fidelity half is a conformance obligation on generators, stated per profile: a generator's output folds to its input. The `roundtrip` fixture kind tests it. The input is a namespace as data, the implementation's generator writes the source, and the fold of that source must equal the input. The reference carries the smallest generator that passes, one form per case with no factoring.
