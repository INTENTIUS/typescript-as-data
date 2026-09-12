---
title: "chant"
description: "The infrastructure toolchain the specification was extracted from, and the reference platform for everything it enables."
weight: 3
diataxis: how-to
---

[chant](https://intentius.io/chant/) is typed infrastructure end to end, TypeScript in and spec-native output out, with the lifecycle (observe, reconcile, apply) built on top of a synthesis core that runs no project code. The specification here was extracted from its fold mechanism and now owns it; chant implements the specification and declares which version.

## Author

A resource is a typed object, `new Bucket({ BucketName: ... })`, with the target spec's own property names and casing, so what is authored is what ships. Seventeen lexicons supply the types from generated schemas. They cover AWS CloudFormation, Azure ARM and GCP Config Connector; Kubernetes and Helm; GitHub Actions and GitLab CI; Fly, Terraform and more.

## Check

Evaluability lint (is this file data) runs at the keystroke, then each lexicon's semantic rules over folded values, then post-synth checks over the emitted artifact. The rules are the lexicon's; the contract they run under is what [issue #79](https://github.com/INTENTIUS/typescript-as-data/issues/79) writes down.

## Generate

Three generators share one pipeline. `chant import` reads an existing template, `--from <env>` imports live through each lexicon's `exportResources()`, and carve-out reads Terraform. Generated source folds back to the artifact it came from; the Kubernetes lexicon carries a round-trip suite, and [issue #80](https://github.com/INTENTIUS/typescript-as-data/issues/80) states the property.

## Proof

chant {{< figure "chantPin" >}} passes every fixture it can answer and agrees with the reference implementation on every one. Over chant's own example corpus the two implementations agree on every comparable file, and produce identical export namespaces wherever both fold.

| Over chant's example corpus | Count |
|---|---|
| Projects and files at <code>{{< figure "corpus.revision" >}}</code> | {{< figure "corpus.entries" >}} projects, {{< figure "corpus.files" >}} files |
| Comparable, all agreed | {{< figure "corpus.comparable" >}} |
| Both fold, namespaces identical | {{< figure "corpus.bothFold" >}} |

The limits that make the other files incomparable are counted rather than hidden, in [the corpus cross-check](/typescript-as-data/spec/conformance/corpus/).
