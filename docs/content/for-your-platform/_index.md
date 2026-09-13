---
title: "Add it to your platform"
description: "What a tool supplies to accept .ts in place of .yml, and what judges it."
weight: 30
diataxis: how-to
hideChildren: true
---

This page is for someone who maintains a tool. If that is not you yet, [start here](/typescript-as-data/start-here/) first.

Your tool reads a YAML file. To read a TypeScript file instead, you supply four things, and the last two are optional.

1. Types for your schema, as a `.d.ts` your users import and `satisfies`. If you have a JSON Schema, this is generated. If you have TypeScript interfaces already, export them.
2. The evaluator. `@intentius/tsad-reference` folds a project to data with no host; a `.ts` branch in your config loader is a call to `foldProject` and a hand-off to whatever validated the YAML.
3. A serializer, if your artifact is not the object itself. For a config loader it usually is.
4. Rules, if you want checks over the declared values or over what you computed from them. You already have them if you validate a config or gate a plan; the fold gives them real values.

That is the whole cost. The evaluator is a package; the types are yours; nothing about your tool's behaviour after the load changes.

## The profile you implement

An evaluator with no JavaScript runtime implements the data-host profile: expression evaluation, the per-file verdict with a failed fold as an error rather than a fallback, envelopes as the output, no helpers, no live constructors. An envelope is the placeholder object the fold writes for a resource, an intrinsic call or an attribute reference it cannot construct without code; your serializer maps it. It is `F-Profile-DataHost` in [the judgments](/typescript-as-data/spec/normative/judgments/), a table of subtractions from the full specification, and the reference with an empty host is judged on it.

## Conformance

The conformance suite, `@intentius/tsad-conformance`: the fixtures at the spec version you declare, a runner, and an adapter interface. You supply an adapter; you get a report. [How the fixtures work](/typescript-as-data/spec/conformance/fixtures/) and [the coverage gate](/typescript-as-data/spec/conformance/coverage/) are under the specification door.

## Evaluators in other languages

The reference is TypeScript. `tsad-eval`, in [`evaluators/rust`](https://github.com/INTENTIUS/typescript-as-data/tree/main/evaluators/rust), is the `data-host` profile written from the text in Rust on oxc with no JavaScript runtime: it passes every fixture tagged for the profile, agrees with the reference on each, and is a column in the corpus cross-check. It is not "rust-as-data"; the language a user writes is TypeScript whatever evaluates it.

One crate builds two forms. The binary speaks JSON on stdin and stdout. The WebAssembly module is the same code compiled for `wasm32-unknown-unknown`; with four exports and no imports it instantiates against an empty import object, which is what lets a browser or an editor load it and Node or Go call it without a subprocess. [This page folds a file with it](/typescript-as-data/try-it/in-the-browser/). The calling convention is a request buffer in and an answer buffer out:

```js
const { instance } = await WebAssembly.instantiate(bytes, {});
const { memory, tsad_alloc, tsad_eval, tsad_free } = instance.exports;
const req = new TextEncoder().encode(JSON.stringify({ op: "foldProject", files, host: {} }));
const ptr = tsad_alloc(req.length);
new Uint8Array(memory.buffer, ptr, req.length).set(req);
const out = tsad_eval(ptr, req.length);
const len = new DataView(memory.buffer).getUint32(out, true);
const answer = JSON.parse(new TextDecoder().decode(new Uint8Array(memory.buffer, out + 4, len)));
tsad_free(ptr, req.length); tsad_free(out, len + 4);
```

In CI the module passes the same fixtures as the binary and agrees with it answer for answer, in `packages/conformance/src/rust-wasm-agreement.test.ts`, so embedding it gets you what the cross-check measured.

## Who has done it

{{< consumers >}}

Each consumer page has the same four sections: how a user authors and how the tool checks, then what it generates back and what proves the agreement.
