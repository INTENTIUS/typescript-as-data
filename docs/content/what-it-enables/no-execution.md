---
title: "Pure synthesis, no execution"
description: "The file becomes the artifact without being run, so the output is a function of the source and nothing else."
weight: 1
diataxis: explanation
---

A TypeScript file whose values are fixed by its source can be reduced to data by reading it. Those values are literals, constants and references to other declarations. Nothing executes. No constructor runs, no environment variable is read and no network call happens. The specification calls this folding, and `F-NoOwnExecution` states the property.

## What that buys

The artifact is a function of the source. The same file gives the same output on any machine at any time, in whatever language the evaluator happens to be written in. A reviewer reading the diff sees exactly what will ship. A tool that cannot run JavaScript at all gets the same value the author sees in the editor, whether it is a Go binary, a WASM module or a CI job with no runtime.

The user never has to think about folding, and meets it as a lint. The editor says at the keystroke whether the file is data and points at the line that makes it not data. That lint is the shape classifier, the `S-*` rules of the grammar, and it needs no evaluator to run.

## Who has it today

chant folds every file it can and measures that it executed nothing. Its `test/leftness` profile reports project code executed `false` and 0 MB of definition-library code on the path, against about 1.7 MB for `cdk synth` on the same estate. Source outside the subset falls back to running in a sandbox, per file, and the two paths are required to agree byte for byte over chant's whole example corpus.

The reference implementation folds with no runtime at all. At spec {{< figure "specVersion" >}} it agrees with chant {{< figure "chantPin" >}} on every one of {{< figure "corpus.comparable" >}} comparable corpus files, and on the {{< figure "corpus.bothFold" >}} that fold on both sides the export namespaces are identical.

## Where the rule lives

`F-NoOwnExecution` in `judgments.md` J4 states it, with the grammar's `S-*` productions for the lint. [The specification](/typescript-as-data/spec/normative/) is the full text and [the corpus cross-check](/typescript-as-data/spec/conformance/corpus/) is the measurement.
