---
title: "Add it to your platform"
description: "What a tool supplies to accept .ts in place of .yml, and what judges it."
weight: 30
diataxis: how-to
hideChildren: true
---

Your tool reads a YAML file. To read a TypeScript file instead, you supply four things, and the last two are optional.

1. Types for your schema, as a `.d.ts` your users import and `satisfies`. If you have a JSON Schema, this is generated. If you have TypeScript interfaces already, export them.
2. The evaluator. `@intentius/tsad-reference` folds a project to data with no host; a `.ts` branch in your config loader is a call to `foldProject` and a hand-off to whatever validated the YAML.
3. A serializer, if your artifact is not the object itself. For a config loader it usually is.
4. Rules, if you want checks over the declared values or over what you computed from them. You already have them if you validate a config or gate a plan; the fold gives them real values.

That is the whole cost. The evaluator is a package; the types are yours; nothing about your tool's behaviour after the load changes.

## The profile you implement

An evaluator with no JavaScript runtime implements the data-host profile: expression evaluation, the per-file verdict with a failed fold as an error rather than a fallback, envelopes as the output, no helpers, no live constructors. It is `F-Profile-DataHost` in [the judgments](/typescript-as-data/spec/normative/judgments/), a table of subtractions from the full specification, and the reference with an empty host is judged on it.

## What judges you

The conformance suite, `@intentius/tsad-conformance`: the fixtures at the spec version you declare, a runner, and an adapter interface. You supply an adapter; you get a report. [How the fixtures work](/typescript-as-data/spec/conformance/fixtures/) and [the coverage gate](/typescript-as-data/spec/conformance/coverage/) are under the specification door.

## Evaluators in other languages

The reference is TypeScript. `tsad-eval`, in [`evaluators/rust`](https://github.com/INTENTIUS/typescript-as-data/tree/main/evaluators/rust), is the `data-host` profile written from the text in Rust on oxc with no JavaScript runtime: it passes every fixture tagged for the profile, agrees with the reference on each, and is a column in the corpus cross-check. As WASM it would embed without a subprocess in Go and Python, in the browser and in an editor. It is not "rust-as-data"; the language a user writes is TypeScript whatever evaluates it.

## Who has done it

{{< consumers >}}

Each consumer page has the same four sections: how a user authors and how the tool checks, then what it generates back and what proves the agreement.
