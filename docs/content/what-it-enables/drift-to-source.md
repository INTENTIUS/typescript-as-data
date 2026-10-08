---
title: "Drift lands on the line you wrote"
description: "A field that drifted is reported against the composite argument and source line that produced it, because the composite was interpreted rather than run."
weight: 3
diataxis: explanation
---

Somebody changes a setting on the server. The next plan says which field drifted. The question you have then is where to change it, and when the field came out of a shared preset, the field in the plan is not a line anyone wrote. It was built by a function from an argument somebody passed, and the fix belongs at that argument.

## See it hold

```text
Clone https://github.com/INTENTIUS/typescript-as-data. Confirm Docker is
running (docker info) and Node 22 or later is installed. From the repo root
run `just smoke round-trip` and explain each SMOKE verdict line to me as it
prints. Then run `BREAK=1 just smoke round-trip` and report the "caught"
line: a field is changed on the server behind the policy's back, and the
plan has to say which part of the source set it.
```

The steps, in the order they print. The policy is applied. Live is read back and diffed against the declared source, and every cycle reports no changes. Then comes the return leg: `allowMergeCommits` is switched back on through the API, and the next plan proposes the one change back. It also says where the value was written. The policy sets that field through a preset, so the plan line reads `reviewPreset(...) argument squashOnly at governance.ts:14:41`. The scenario finds that line in the file it wrote and requires the plan to agree.

Under `BREAK=1` the drift lands on `hasWiki` instead, which the policy writes directly. The plan says `<- direct`, the check for a preset attribution cannot be met, and the scenario reports it caught. A plan that named no origin at all would fail the same check.

A second scenario, `fold-equals-run`, holds the guarantee the others rest on: folding and running the same policy give the same plan, and a file that reads the environment is refused before either is trusted.

## From the field to the argument

When repositories are written through a shared preset, the plan's field has to be traced back through the preset.

```ts
// presets.ts
export function repoPreset(opts: { name: string; wiki?: boolean }) {
  return { name: opts.name, settings: { wiki: opts.wiki ?? false, issues: true } };
}

// repos.ts
import { repoPreset } from "./presets";
export const api = repoPreset({ name: "api", wiki: false });
```

The reference folds `repos.ts` and reports an origin for every field it emits. These are the two under `settings`.

```json
{
  "api.settings.wiki": {
    "kind": "composite-parameter", "composite": "repoPreset", "instance": "api", "parameters": ["wiki"],
    "call": { "file": "repos.ts", "line": 2, "column": 20 },
    "arguments": { "wiki": { "file": "repos.ts", "line": 2, "column": 52 } }
  },
  "api.settings.issues": {
    "kind": "composite-literal", "composite": "repoPreset", "instance": "api",
    "call": { "file": "repos.ts", "line": 2, "column": 20 },
    "literal": { "file": "presets.ts", "line": 2, "column": 75 }
  }
}
```

Drift on `wiki` points at the `false` on line 2 of `repos.ts`. That argument belongs to this one repository. Drift on `issues` points into the preset. The value is fixed there for every repository that uses it, so changing it changes all of them.

Only the fold side can say this. Running `repoPreset` returns an object, and by then nothing records which argument became which field. Interpreting the function keeps the expression each field was written as, so the origin is in hand when the value is.

An origin is one of four kinds. `direct` is a value written at the export, outside any composite. A composite parameter names the composite and the parameter the value came from. A composite literal is a value the composite's body fixes. `unknown` means the implementation cannot say, and it is never reported as `direct`. When composites nest, the innermost one that wrote the field is the origin.

Provenance is optional by design. The run path does not produce it, so it sits outside the equivalence objective that fold and run must meet. An implementation reports whether it claims provenance, and the conformance fixtures for it are judged only for one that does.

## In a cluster

chant reports the same thing for Kubernetes. Its drift demo builds a small app whose `WebApp` composite sets a Deployment's replica count from an argument, applies it to a k3d cluster and scales the Deployment from 3 to 5 with `kubectl`. The live diff then reports the field on the call.

```text
spec.replicas: 3 → 5 [from: composite WebApp parameter replicas]
  spec.replicas on K8s::Apps::Deployment webDeployment comes from WebApp({ replicas: 3 }) at src/app.ts:11
```

Line 11 of `src/app.ts` is `replicas: 3,` inside the call. The rendered YAML has a `replicas: 3` too, and editing it would change nothing, because the YAML is regenerated from the call on the next build. [chant's drift guide](https://intentius.io/chant/guide/drift-to-source/) has the demo and the command that runs it.

## Who has it today

The reference implementation reports an origin for every field it folds, and passes the conformance fixtures for it. chant records the origin while it builds and puts it on each drifted field in `chant lifecycle diff --live`. forgejo-warden's plan names the drifted field, and under it the origin it reads from the reference's provenance: the preset call, argument and line for a field its example policy sets through `reviewPreset`, and `direct` for one written on the repo.

## What it does not establish

Across chant's example corpus, {{< figure "provenance.fold.compositeKnown" >}} of the {{< figure "provenance.fold.compositeFields" >}} fields a composite expanded in files that fold have a known origin ({{< figure "provenance.fold.compositeKnownShare" >}}). The others all come from composites the lexicons ship. chant calls those factories and does not read their bodies, so their fields are unknown whether the file folds or runs, and finding the argument behind one of them is still done by hand. The two project composites called in folding files have every field attributed. The count is of fields rather than of drift. It was taken at chant <code>{{< figure "provenance.corpusVersion" >}}</code>, the first release that reports it. [The evidence page](/typescript-as-data/spec/evidence/) carries the rest of the column.

## Where the rule lives

`F-Obs-Provenance` in [`observables.md`](/typescript-as-data/spec/normative/observables/) states what an implementation that claims provenance must report: one origin of four kinds for every emitted field, the innermost writer winning when composites nest, and an unknown origin never reported as direct.
