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
| Comparable files | {{< figure "corpus.comparable" >}}, all agreed | `packages/conformance/corpus-report.md` | {{< figure "corpus.noHost" >}} loads no package |
| Both fold, identical namespaces | {{< figure "corpus.bothFold" >}} | same | Entities compared as class plus properties, on one shared host |
| The data-host column | {{< figure "corpus.dataHost.agreed" >}} of {{< figure "corpus.dataHost.files" >}} agree, {{< figure "corpus.dataHost.bothFold" >}} fold on both | same, with `evaluators/rust` built | Two evaluators on one profile; neither runs anything |

`paper/measurements.md` is the full statement of each measurement and the history of what changed. The chant-side measurements (the fold differential, the execution-boundary profile) live in chant's repository and are cited there.
