---
title: "Round-trip generation"
description: "Live state or an existing artifact becomes source that folds back to exactly what it came from."
weight: 3
diataxis: explanation
---

Folding goes one way, source to data, and a generator goes the other. Put them together and an existing artifact becomes TypeScript that folds back to exactly the data it came from, whether that artifact is a CloudFormation template, a live Kubernetes namespace or an org's current settings. Under `data-host` you get back exactly what you put in. Under `full` you get it as live objects instead, because that is what the profile turns a resource into.

## Why the language matters here

A YAML-to-YAML round trip is the identity and proves nothing. Going through TypeScript is worthwhile because the generator decides what each value *is*. This string is a literal; that one is a reference to another resource's attribute; a third is a build parameter; a repetition across forty resources is one `const`, spread where it is used.

Each decision needs a source form the subset can express and the fold can reverse. YAML cannot express the first three. TypeScript expresses all four with object literals and constants, plus spreads and member access.

## See it hold

```text
Clone https://github.com/INTENTIUS/typescript-as-data. Confirm Docker is
running (docker info) and Node 22 or later is installed. From the repo root
run `just smoke round-trip` and explain each SMOKE verdict line to me as it
prints. Then run `BREAK=1 just smoke round-trip` and report the "caught"
line: one field is changed on the server behind the policy's back, and the
next plan names exactly that field.
```

The steps, in the order they print: the policy is applied; live is read back and diffed against the declared source, and every cycle reports no changes. Under `BREAK=1` the repo's wiki is switched on through the API, and the next plan proposes the one change back.

A second scenario, `fold-equals-run`, holds the guarantee the others rest on: folding and running the same policy give the same plan, and a file that reads the environment is refused before either is trusted.

## Who has it today

chant has three generators through one pipeline. `chant import` reads a template file, `--from <env>` imports live through each lexicon's `exportResources()`, and carve-out reads Terraform. The Kubernetes lexicon carries a round-trip suite. forgejo-warden's reconcile direction is the same idea for an org, with live reality read back and diffed against declared source.

## What it does not establish

The round trip is stated per profile and the two statements are not the same one, which is the distinction above. The fixture kind tests one generator's output against its own input. It does not establish that a generator you write round-trips, which is the obligation `F-Val-Source` places on the generator rather than a property this specification can discharge for you.

## Where the rule lives

The completeness half is [`F-Val-Source`](/typescript-as-data/spec/normative/values/): one source form per case of the value domain, each folding back by a rule the table cites.

The fidelity half is an obligation on generators, stated per profile: a generator's output folds to its input. The `roundtrip` fixture kind tests it. The input is a namespace as data; the generator writes the source; the fold of that source must equal the input. 