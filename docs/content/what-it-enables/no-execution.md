---
title: "Pure synthesis, no execution"
description: "The build takes the values from the source without executing any statement the file wrote."
weight: 1
diataxis: explanation
---

A TypeScript file whose values are fixed by its source can be reduced to data by reading it. The specification calls this folding, and `F-NoOwnExecution` states the property.

For a file that folds, the build executes none of its top-level statements. The rule bounds what still runs to four named cases. Every one of them is code the file imported rather than code the file wrote.

In the `data-host` profile nothing is invoked to produce the values. `F-Profile-DataHost` redefines revival as serialization and removes every rule that needs a JavaScript runtime. Each envelope reaches the serializer as data and no constructor is invoked. That is the profile the Rust evaluator implements and the one [the browser demo](/typescript-as-data/try-it/in-the-browser/) runs.

The alternative is the run path: the build executes the file as a program and takes its exports. Same artifact, at the cost of everything below.

## Checked before anything runs

The user never has to think about folding, and meets it as a lint. The editor says at the keystroke whether the file is data and points at the line that makes it not data. That lint is the shape classifier, the `S-*` rules of the grammar, and it needs no evaluator to run.

A tool that executes your program cannot offer this. Until the program has run there is nothing to check. The earliest such a tool can answer is after the execution has already happened. `cdk synth` learns what an app builds by constructing it.

## Consequences

The artifact is a function of the source and of the build-parameter binding. The same file gives the same output on any machine at any time, in whatever language the evaluator happens to be written in. A tool that cannot run JavaScript at all gets the same value the author sees in the editor, whether it is a Go binary, a WASM module or a CI job with no runtime.

That guarantee is unconditional in `data-host`, where nothing is invoked to produce them. In `full` it is as good as the host's lexicons and the isolation mode. `F-IsolatedRefusal` refuses every project-owned invocation under `isolated`. The default `open` mode reaches two things no purity criterion covers. `F-Call` step 6 may invoke a project factory that nobody registered. `F-Host-Interface` item 1 says what an entity constructor carries without bounding what it does.

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

chant folds every file it can and measures that it executed nothing. Its `test/leftness` profile reports project code executed `false` and 0 MB of definition-library code on the path, against about 1.7 MB for `cdk synth` on the same estate. The harness holds that estate to a complete fold and its run fails unless every file reports `[fold:fold]`. What the profile captures is therefore a fully folding estate. Source outside the subset takes the run path in a sandbox, one file at a time.

Both profiler recordings are readable in the browser. [The `cdk synth` recording](https://spicypath.intentius.workers.dev/leftness-cdk) carries a marker on the moment the app starts, and stays lit from there. [The `chant build` recording](https://spicypath.intentius.workers.dev/leftness-chant) answers the same search with no matches. [Flame graphing the leftness of infra tooling](https://lex00.github.io/posts/flame-graphing-the-leftness-of-infra-tooling/) walks through both, and the harness that regenerates them is [`test/leftness`](https://github.com/INTENTIUS/chant/tree/main/test/leftness).

The reference implementation folds with no runtime at all. At spec {{< figure "specVersion" >}} it agrees with chant {{< figure "chantPin" >}} on every one of {{< figure "corpus.comparable" >}} comparable corpus files, and on the {{< figure "corpus.bothFold" >}} that fold on both sides the export namespaces are identical.

## Where the rule lives

`F-NoOwnExecution` in `judgments.md` J4 states it, with the grammar's `S-*` productions for the lint. [The specification](/typescript-as-data/spec/normative/) is the full text.

This rule has no fixture, and `spec/fixtures/UNCOVERED.md` gives the reason: an adapter reports verdicts, and a verdict cannot say what ran. The conformance suite reaches the property's observable instead. `F-Obs-Counters` requires a build to report `projectFactoryInvocations`, which is zero across every folded file, and [that one is tested](/typescript-as-data/spec/conformance/coverage/). The recordings above are the direct evidence, measured on the process rather than read off a verdict.
