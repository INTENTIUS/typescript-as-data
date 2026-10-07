---
title: "Adopt what you already have"
description: "An existing template, manifest or live estate is imported as typed source, and the rebuilt artifact is compared with the original byte for byte."
weight: 2
diataxis: explanation
aliases: ["/what-it-enables/round-trip/"]
---

You already have infrastructure. A CloudFormation template, a live Kubernetes namespace, an org whose settings somebody clicked into a web UI years ago. You want it as TypeScript without hand-copying a thousand lines and hoping.

A generator reads what is there and writes the TypeScript. Build that TypeScript and you should get back what you started with. How often you do is measured below, in bytes, and for CloudFormation the answer today is not often.

## Measured in bytes

chant imported 20 CloudFormation templates from the awslabs/aws-cloudformation-templates repository and 22 Kubernetes manifests from the Kubernetes documentation examples. Each was run through `chant import` and then `chant build`, and the rebuilt document was compared with the original after canonical ordering. The run was on 2026-10-07 with chant `0.108.1`.

| Target | Inputs | Byte-identical | Differ | Failed before the comparison |
|---|---|---|---|---|
| Kubernetes | 22 | 19 | 2 | 1 |
| CloudFormation | 20 | 0 | 3 | 17 |

Canonical ordering parses each file and sorts the keys of every mapping. Arrays keep their order. CloudFormation short-form tags such as `!Sub` are rewritten to their long form first. Parsing loses comments and quoting, so those are outside the measure.

Of the three Kubernetes manifests that did not come back, one moved from `autoscaling/v1` to `autoscaling/v2` with nothing else changed. One emitted an allow-all egress rule as `null`. The third stopped on the check for a hard-coded value in a sensitive environment variable, so it produced no output.

Seventeen CloudFormation templates failed before there was anything to compare:

| Reason | Templates |
|---|---|
| The generated source names something defined in another generated file, or not defined at all | 8 |
| A `Fn::Sub` template refers to a resource directly, which the build refuses | 4 |
| An output of a bare `Ref` is rejected | 3 |
| The generated source does not compile | 1 |
| The template uses a YAML tag the parser does not know | 1 |

The three that built drop the template's `Description` and `Metadata` and the parameter constraints. One also drops its deletion policies. [chant's import page](https://intentius.io/chant/cli/import/#how-closely-an-import-round-trips) lists every input with its upstream source and has the command that repeats the measurement.

## Why the language matters here

Turning YAML into YAML proves nothing, because you could have copied the file. Going through TypeScript is worth something because the generator has to decide what each value actually is.

This string is just a string. That one is a reference to another resource. A third is a setting you pass in at build time. The same block repeated across forty resources is one name, written once and spread where it is used.

Those are four different things and YAML cannot tell three of them apart. TypeScript can. Then the fold has to turn every one of them back into the value it started as, which is what makes the comparison a test rather than a copy.

## Who has it today

chant has three generators through one pipeline. `chant import` reads a template file and `--from <env>` imports live through each lexicon's `exportResources()`. Carve-out reads Terraform. The Kubernetes lexicon carries its own round-trip suite. forgejo-warden's reconcile direction is the same idea for an org, where live reality is read back and diffed against declared source.

## What it does not establish

The CloudFormation number is weak. None of 20 public templates came back identical, and 17 of them failed before a comparison was possible. Kubernetes manifests mostly come back exact. Both figures are 42 public samples at one chant version, measured once, and say nothing yet about an estate of yours.

## Where the rule lives

The completeness half is [`F-Val-Source`](/typescript-as-data/spec/normative/values/), with one source form per case of the value domain and the rule each one folds back by.

The fidelity half is an obligation on generators, stated per profile. A generator's output folds back to its input. The `roundtrip` fixture kind tests it. The input is a namespace as data, the generator writes the source, and the fold of that source must equal the input. A fixture tests one generator against its own inputs. Whether a generator you write meets the obligation is for that generator to show.
