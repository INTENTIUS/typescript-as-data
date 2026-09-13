---
title: "Fold a file in your browser"
description: "The Rust evaluator, compiled to WebAssembly, reads a TypeScript file as data on this page. No server, no JavaScript engine evaluating your file."
weight: 2
diataxis: tutorial
---

The box below holds a TypeScript file. Press the button and the file is folded to its values by `tsad-eval`, the evaluator written in Rust for the data-host profile, compiled to WebAssembly and loaded into this page, {{< figure "wasmKB" >}} KB fetched once. Nothing is sent anywhere. The browser's JavaScript engine never evaluates your file; it only runs the evaluator, which reads the text and produces the values.

Edit the file and fold again. Add something a data file cannot contain, a `let` or a call to `Date.now()`, and the answer names the line and the rule that refused it.

{{< fold-demo >}}

## What just happened

The page sent the evaluator one request, `{ "op": "foldProject", "files": { "policy.ts": … }, "host": {} }`, the same request the conformance suite sends it, and printed the verdict. A `fold` verdict carries the file's exports as values. A `run` verdict carries the rule that refused the file and the line it points at; in a full build that file would be executed instead, and here, with no runtime, it simply is not data.

The module is `evaluators/rust` compiled for `wasm32-unknown-unknown`. It has four exports and no imports, so it instantiates in any WebAssembly host with an empty import object, whether that is a browser or an editor extension, Node without a subprocess, or Go through wazero. In CI the same module passes every fixture tagged for the data-host profile, agrees with the reference implementation on each, and agrees with the native binary answer for answer, so what this page runs is what [the corpus cross-check](/typescript-as-data/spec/conformance/corpus/) measured. [Add it to your platform](/typescript-as-data/for-your-platform/#evaluators-in-other-languages) shows the calling convention.
