---
title: "Drift lands on the line you wrote"
description: "A field that drifted is reported against the preset argument and source line that set it."
weight: 3
---

Someone changes a setting on the server, and the next plan names the field. If a shared preset built that field, the fix belongs at the argument passed to the preset. The plan from forgejo-warden points there.

```text
UPDATE:
  [repo] api
    hasWiki: true → false
      <- direct
    allowMergeCommits: true → false
      <- reviewPreset(...) argument squashOnly at examples/governance.ts:33:55
```

Only a build that reads the preset's body can say this. Running the preset returns an object, and nothing records which argument became which field.

## Try it

```text
Clone https://github.com/INTENTIUS/typescript-as-data. Confirm Docker is
running and Node 22 or later is installed. Run `just smoke round-trip` and
explain each SMOKE line. Then run `BREAK=1 just smoke round-trip` and
report the "caught" line.
```

The scenario turns `allowMergeCommits` back on through the API and requires the plan to name the preset argument and its line. Under `BREAK=1` the drift lands on a field written directly. No preset can be named, so the check reports it caught. chant's [drift guide](https://intentius.io/chant/guide/drift-to-source/) does the same for a Kubernetes Deployment on a local cluster.

## The limit

The composite has to be one the build reads. chant calls the composites its lexicons ship without reading them, so their fields have no known origin. Across chant's examples, {{< figure "provenance.fold.compositeKnown" >}} of {{< figure "provenance.fold.compositeFields" >}} composite-built fields have one ({{< figure "provenance.fold.compositeKnownShare" >}}).

The rule is `F-Obs-Provenance` in [`observables.md`](https://github.com/INTENTIUS/typescript-as-data/blob/main/spec/observables.md).
