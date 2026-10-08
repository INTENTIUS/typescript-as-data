---
title: "Fold a file in your browser"
description: "The Rust evaluator, compiled to WebAssembly, reads a TypeScript file as data on this page."
weight: 2
---

Press the button and `tsad-eval` reads the file below to its values. The evaluator is written in Rust and compiled to WebAssembly. Nothing is sent anywhere, and the browser never evaluates your file.

Add a `let` or a call to `Date.now()` and fold again. The answer names the line and the rule that refused it. In a real build that file would be run instead.

{{< fold-demo >}}

The same module passes every conformance fixture for builds with no JavaScript runtime, and agrees with the reference implementation on each. It has no imports, so any host that runs WebAssembly can load it.
