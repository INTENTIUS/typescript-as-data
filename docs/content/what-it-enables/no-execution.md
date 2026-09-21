---
title: "Pure synthesis, no execution"
description: "The build takes the values from the source without executing any statement the file wrote."
weight: 1
diataxis: explanation
---

Your config says a repo has no wiki and squash merges on. A tool reads it and tells you what it will deploy.

It does that by reading. It never runs your code. A line that deletes something never happens. Neither does one that phones an API or reads the clock. Nothing is executed to find out what you declared.

The specification calls this folding, and it is what the rest of this page is about.

Not every file can be read this way. One that computes its values in a loop or calls out to something is run instead. It runs properly, as a program. You are told which ones those were, so what you never get is something reported as read when it was quietly run.

## Checked before anything runs

The user never has to think about folding, and meets it as a lint. The editor says at the keystroke whether the file is data and points at the line that makes it not data. That lint is the shape classifier, the `S-*` rules of the grammar, and it needs no evaluator to run.

A tool that executes your program cannot offer this. Until the program has run there is nothing to check. The earliest such a tool can answer is after the execution has already happened. `cdk synth` learns what an app builds by constructing it.

## Consequences

The artifact is a function of the source and of the build-parameter binding. The same file gives the same output on any machine at any time, in whatever language the evaluator happens to be written in. A tool that cannot run JavaScript at all gets the same value the author sees in the editor, whether it is a Go binary, a WASM module or a CI job with no runtime.

How far that holds depends on what the tool is allowed to run. With no JavaScript runtime at all, nothing runs, which is the setting [the browser demo](/typescript-as-data/try-it/in-the-browser/) uses. Normally the libraries your config imports do run. Your own code does not. One gap remains: a factory your own project published and never registered with the tool still runs, and there is a stricter mode that refuses even that.

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

A profile is the wrong instrument for the claim, because the claim is closure rather than volume. A `--cpu-prof` figure has a sampling floor, so 0 MB means everything the profiler could see. So the reference counts instead. Every site in it that invokes code it did not write records the invocation and the rule that admits it, and a counting proxy around the host's callables counts the same invocations without being told what they are. Across {{< figure "execution.foldingFixtures" >}} fully folding whole-build fixtures the ledger holds {{< figure "execution.foldingInvocations" >}} invocations and the two counts agree. Each one names an arm of `F-NoOwnExecution`. An invocation either observer sees and the other does not is an unmapped frame and fails the build. There are {{< figure "execution.unmapped" >}}.

The list is closed and short:

- reviving a value the file wrote as data
- an intrinsic the host registered to run at fold time
- a method on a value that is already real
- a factory a package published

Nothing reached anything else. An entry nothing reaches fails too, so the list has no dead members.

Two things a profiler cannot show, and this does. With no JavaScript runtime the count is zero across {{< figure "execution.dataHostFixtures" >}} projects, which is a promise made visible rather than measured. And {{< figure "execution.mixedFixtures" >}} fixtures are estates that do not fold completely, where a file that folds sits beside one that runs. chant's harness fails unless every file folds, so it has never recorded one.

The reference implementation folds with no runtime at all. At spec {{< figure "specVersion" >}} it agrees with chant {{< figure "chantPin" >}} on every one of {{< figure "corpus.comparable" >}} comparable corpus files, and on the {{< figure "corpus.bothFold" >}} that fold on both sides the export namespaces are identical.

## What it does not establish

It is a claim about your file rather than about the whole build. Library code does run. The list of what may is short and closed. A file that cannot be read this way is executed instead. You are told which ones those were.

## Where the rule lives

`F-NoOwnExecution` in `observables.md`, J4, states it, with the grammar's `S-*` productions for the lint. [The specification](/typescript-as-data/spec/normative/) is the full text.

This rule has no fixture, and `spec/fixtures/UNCOVERED.md` gives the reason: an adapter reports verdicts, and a verdict cannot say what ran. The conformance suite reaches the property's observable instead. `F-Obs-Counters` requires a build to report `projectFactoryInvocations`, which is zero across every folded file, and [that one is tested](/typescript-as-data/spec/conformance/coverage/). The recordings above are the direct evidence, measured on the process rather than read off a verdict.
