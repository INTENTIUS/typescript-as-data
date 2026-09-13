---
title: "Pure synthesis, no execution"
description: "The file becomes the artifact without being executed, so the output is a function of the source and nothing else."
weight: 1
diataxis: explanation
---

A TypeScript file whose values are fixed by its source can be reduced to data by reading it. Nothing executes. No constructor is called, no environment variable is read and no network call happens. The specification calls this folding, and `F-NoOwnExecution` states the property. The alternative is the run path: the build executes the file as a program and takes its exports, which gives the same artifact at the cost of everything below.

## Consequences

The artifact is a function of the source. The same file gives the same output on any machine at any time, in whatever language the evaluator happens to be written in. A tool that cannot run JavaScript at all gets the same value the author sees in the editor, whether it is a Go binary, a WASM module or a CI job with no runtime.

The user never has to think about folding, and meets it as a lint. The editor says at the keystroke whether the file is data and points at the line that makes it not data. That lint is the shape classifier, the `S-*` rules of the grammar, and it needs no evaluator to run.

## See it hold

```text
Clone https://github.com/INTENTIUS/typescript-as-data. Confirm Docker is
running (docker info) and Node 22 or later is installed. From the repo root
run `just smoke no-execution` and explain each SMOKE verdict line to me as it
prints. Then run `BREAK=1 just smoke no-execution` and report the "caught"
line: the same file is run instead of folded, and the marker it writes
appears.
```

The steps, in the order they print: the policy carries a `writeFileSync` at top level; the fold produces the plan for the repo setting it declares; the marker file does not exist, because the fold read the file and ran none of it. Under `BREAK=1` the same file goes through `--config-mode run` and the marker appears, which is what the third step's check would have caught.

## Who has it today

chant folds every file it can and measures that it executed nothing. Its `test/leftness` profile reports project code executed `false` and 0 MB of definition-library code on the path, against about 1.7 MB for `cdk synth` on the same estate. Source outside the subset takes the run path in a sandbox, one file at a time.

The reference implementation folds with no runtime at all. At spec {{< figure "specVersion" >}} it agrees with chant {{< figure "chantPin" >}} on every one of {{< figure "corpus.comparable" >}} comparable corpus files, and on the {{< figure "corpus.bothFold" >}} that fold on both sides the export namespaces are identical.

## Where the rule lives

`F-NoOwnExecution` in `judgments.md` J4 states it, with the grammar's `S-*` productions for the lint. [The specification](/typescript-as-data/spec/normative/) is the full text and [the corpus cross-check](/typescript-as-data/spec/conformance/corpus/) is the measurement.
