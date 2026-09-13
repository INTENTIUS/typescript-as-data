---
title: "Glossary"
description: "Every term this site uses, in one or two sentences each."
weight: 45
hideChildren: true
---

Terms are in alphabetical order, one short entry each. A term in code font is written that way in the specification.

| Term | Meaning |
|---|---|
| Artifact | What a tool produces from your policy and acts on. A YAML or JSON file, a plan of changes, or a manifest sent to a server. |
| Build | One reading of a whole project by a tool. The specification writes it as the set of files, the imports between them, and the build parameters. |
| Build parameter | A value supplied when the build is invoked, such as an environment name, that a file reads as `params.name`. It folds to the literal the build was given. |
| chant | The infrastructure toolchain the specification was extracted from. It is an implementation of the specification and declares which version. |
| Composite | A project-defined factory that a host has registered, so the tool can evaluate its body from source rather than running it. |
| Conformance | Whether an implementation gives the verdicts the specification requires. The conformance suite is the set of fixtures and the runner that checks an implementation against them. |
| Corpus | A body of real projects that nobody wrote for testing, run through two implementations to see whether they agree. chant's example projects are one; two projects nobody here maintains are another. |
| Data-host profile | The subset of the specification an implementation with no JavaScript runtime implements. It reads files and never runs anything, so an envelope is its output. |
| Declarator | One exported binding in a file, such as `export const policy = …`. A file's verdict is decided one declarator at a time. |
| Entity | An object a host's class produces, such as a bucket or a repository. It is opaque to the fold and carries its own identity. |
| Envelope | A placeholder object the fold writes for something it cannot build without code: a resource, an intrinsic call or a reference to another entity's attribute. A serializer turns it into output. |
| Evaluator | A program that folds files. The reference implementation is one in TypeScript; `tsad-eval` is one in Rust. |
| Fixture | One test case for one rule: a small file or project and the verdict the specification requires for it. |
| Fold | Reading a file's values off its text without running the file. The verdict `fold` means that succeeded, and the file's exports are known. |
| forgejo-warden | A tool that keeps a Forgejo code-hosting organisation in a declared state. It is the first consumer of the reference implementation that is neither this repository nor chant. |
| Full profile | The whole specification, for an implementation that has a JavaScript runtime and can run a file when the fold fails. |
| Helper | A small function a host supplies for authoring, such as a string transform, that a folded file may call. |
| Host | The tool reading the policy, as the specification sees it. A host supplies classes and rules, an intrinsic registry and a trust set of packages; the specification says how each is admitted. |
| Intrinsic | A call or tagged template a host registers as foldable, such as a reference to a resource's name. It folds to an envelope rather than to a value. |
| Isolation mode | How much a build may execute to fold a file. `open` is the default and executes no project code; `isolated` refuses every invocation of project code; `executing` is the one opt-in under which a project function whose body cannot fold is invoked. |
| J1, J2, J3, J4 | The four judgments of the specification. J1 is one expression and J2 one file; J3 is the whole build and J4 the properties of the mechanism. |
| Lexicon | chant's word for a package that supplies the types and classes for one target, such as Kubernetes or AWS. |
| Namespace | The set of a file's exports with their values, which is what a fold produces. |
| Pin | The exact version of chant this repository tests against. It is a real dependency, so the version under test is the one a user would install. |
| Policy | The file that says what you want, read by a tool that makes the world match it. On this site it is `governance.ts`. |
| Profile | A named subset of the specification an implementation may claim. There are two, full and data-host. |
| Reference implementation | `@intentius/tsad-reference`, an evaluator written from the specification text and nothing else, used to check the text is complete enough to implement from. |
| Revival | Turning an envelope back into a real object once the host's code is available, at the end of a fold in the full profile. |
| Rule identifiers | Every rule in the specification has a name. `S-` rules are decided from syntax alone; `F-` rules need name resolution, a host or the module graph. |
| Run | The fallback when a file cannot be folded. The JavaScript engine executes the file and the tool takes whatever the exports hold at the end; the verdict's reason names the line that made the file a program. |
| Serializer | The part of a host that turns folded values, envelopes included, into the artifact. |
| Specification version | A number such as `1.8` naming the rule set at a point in time, tagged in the repository. It moves when a rule changes, never when a release ships. |
| Taint | The reason a file that could fold on its own runs anyway: another file that runs imports it or captured its objects, and running both is the only way to keep one copy of each entity. |
| Verdict | The specification's answer for one file, `fold` with the exports or `run` with a reason. |
| YAML | The text format most deploy tools read their settings from. It nests by indentation and pairs each key with a value, and nothing in it can check a key exists. |
