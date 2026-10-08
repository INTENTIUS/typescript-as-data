---
title: "Adopt what you already have"
description: "An existing template, manifest or live estate becomes typed source, and the rebuilt output is compared with the original byte for byte."
weight: 2
aliases: ["/what-it-enables/round-trip/"]
---

You have a CloudFormation template or a Kubernetes namespace and want it as TypeScript. `chant import` writes the source. YAML does not say whether a string is plain text or a reference to another resource, so the importer decides for each value. Build the source again and you should get the original back.

chant measured how often that happens on public samples, comparing after sorting keys:

| Target | Inputs | Byte-identical | Differ | Failed before the comparison |
|---|---|---|---|---|
| Kubernetes | 22 | 19 | 2 | 1 |
| CloudFormation | 20 | 0 | 3 | 17 |

[chant's import page](https://intentius.io/chant/cli/import/#how-closely-an-import-round-trips) lists every input, the reason each one failed and the command that repeats the run.

## The limit

The CloudFormation result is poor. Most templates fail before there is anything to compare. The three that build lose fields along the way. Both rows are 42 public samples measured once at chant 0.108.1, and say nothing yet about your estate.

The rule is `F-Val-Source` in [`values.md`](https://github.com/INTENTIUS/typescript-as-data/blob/main/spec/values.md).
