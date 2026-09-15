---
title: "Evidence"
description: "Every number on this site, with the artifact it comes from and the limit that bounds it."
weight: 5
diataxis: reference
aliases: ["/evidence/"]
---

No figure on this site was typed by hand. Each one below is read from an artifact in the repository at build time and is stated with what it does not establish.

| Figure | Value | Artifact | Limit |
|---|---|---|---|
| Specification version | {{< figure "specVersion" >}} | `spec/VERSION`, tag <code>spec-{{< figure "specVersion" >}}</code> | A version names a rule set, not a chant release |
| chant pin | {{< figure "chantPin" >}} | root `package.json` | The engine under test, not necessarily the corpus's revision |
| Reference implementation | {{< figure "referenceVersion" >}} | `packages/reference/package.json` | Same author as chant; not an independent implementation |
| Conformance suite | {{< figure "conformanceVersion" >}} | `packages/conformance/package.json` | Carries the fixtures at the declared spec version |
| Rules with a fixture | {{< figure "rulesWithFixture" >}} of {{< figure "rulesTotal" >}} | `spec/fixtures/UNCOVERED.md` | The rest are listed with a reason each |
| Fixtures | {{< figure "fixtures" >}}, of which {{< figure "wholeBuildFixtures" >}} whole-build | `spec/fixtures/` | Cases somebody chose |
| Corpus | {{< figure "corpus.entries" >}} projects, {{< figure "corpus.files" >}} files | chant <code>{{< figure "corpus.corpusVersion" >}}</code> at <code>{{< figure "corpus.revision" >}}</code> | chant's own examples, not a sample of real-world source |
| Comparable files | {{< figure "corpus.comparable" >}}, verdicts agree | `packages/conformance/corpus-report.md` | Verdict agreement, which is the weaker claim; {{< figure "corpus.noHost" >}} loads no package |
| Both fold, identical namespaces | {{< figure "corpus.bothFold" >}} | same | Entities compared as class plus properties, on one shared host |
| The evaluator as WebAssembly | {{< figure "wasmKB" >}} KB, no imports | `evaluators/rust` built for `wasm32-unknown-unknown`; `rust-wasm-agreement.test.ts` | The same crate as the binary; it proves embedding, and the profile's proof is the column below |
| The data-host column | {{< figure "corpus.dataHost.agreed" >}} of {{< figure "corpus.dataHost.files" >}} agree, {{< figure "corpus.dataHost.bothFold" >}} fold on both | same, with `evaluators/rust` built | Two evaluators on one profile, sharing an author and one specification text, so agreement shows the text is implementable rather than right. Writing the Rust one found the reference reviving and tainting in a profile that does neither, both fixed in the reference |

## The claims, and the scenarios that check them

Each claim on [what it enables](/typescript-as-data/what-it-enables/) has a scenario under `scripts/smoke/scenarios/` that runs on a throwaway Forgejo and prints one verdict line per step. The weekly demo workflow runs every scenario twice and commits the result here. The second run sets `BREAK=1`, which sabotages the setup so the scenario has to catch it.

{{< smoke-rows >}}

## What the consumer is running

The site presents `forgejo-warden` as the demonstration that this specification is usable by a platform that is neither this repository nor chant, and a demonstration is worth what it actually runs. Warden pins its own evaluator, so the version it demonstrates is that repository's lockfile rather than this one's. Nothing here read it until #192, and it had drifted six minors behind unnoticed.

{{< consumer-skew >}}

Read rather than gated. Which version a consumer pins is that repository's decision, and no gate here can see its lockfile between runs. Nothing had to be added to warden for this: `spec/README.md` already asks an implementation to declare the version it implements, and the evaluator warden installs already carries the declaration. What was missing was something on this side that looked.

`paper/measurements.md` is the full statement of each measurement and the history of what changed. The chant-side measurements (the fold differential, the execution-boundary profile) live in chant's repository and are cited there.
