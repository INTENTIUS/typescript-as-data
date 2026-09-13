---
title: "Glossary"
description: "The terms this site uses, one line each. The specification defines its own vocabulary where it uses it."
weight: 45
hideChildren: true
---

Terms are in alphabetical order, one line each. The specification has a vocabulary of its own, defined in its own text, and this is not that list.

| Term | Meaning |
|---|---|
| Artifact | What a tool produces from your policy and acts on. A YAML or JSON file, a plan of changes, or a manifest sent to a server. |
| Build | One reading of a whole project by a tool. The specification writes it as the set of files, the imports between them, and the build parameters. |
| chant | The infrastructure toolchain the specification was extracted from. It is an implementation of the specification and declares which version. |
| Conformance | Whether an implementation gives the verdicts the specification requires. The conformance suite is the set of fixtures and the runner that checks an implementation against them. |
| Corpus | A body of real projects that nobody wrote for testing, run through two implementations to see whether they agree. chant's example projects are one; a project nobody here maintains is another. |
| Data-host profile | The subset of the specification an implementation with no JavaScript runtime implements. It reads files and never runs anything, so an envelope is its output. |
| Entity | An object a host's class produces, such as a bucket or a repository. It is opaque to the fold and carries its own identity. |
| Envelope | A placeholder object the fold writes for something it cannot build without code: a resource, an intrinsic call or a reference to another entity's attribute. A serializer turns it into output. |
| Evaluator | A program that folds files. The reference implementation is one in TypeScript; `tsad-eval` is one in Rust. |
| Fixture | One test case for one rule: a small file or project and the verdict the specification requires for it. |
| Fold | Reading a file's values off its text without running the file. The verdict `fold` means that succeeded, and the file's exports are known. |
| forgejo-warden | A tool that keeps a Forgejo code-hosting organisation in a declared state. It is the first consumer of the reference implementation that is neither this repository nor chant. |
| Helper | A small function a host supplies for authoring, such as a string transform, that a folded file may call. |
| Host | The tool reading the policy, as the specification sees it. A host supplies classes and rules, an intrinsic registry and a trust set of packages; the specification says how each is admitted. |
| Lexicon | chant's word for a package that supplies the types and classes for one target, such as Kubernetes or AWS. |
| Policy | The file that says what you want, read by a tool that makes the world match it. On this site it is `governance.ts`. |
| Pre-synthesis, post-synthesis | The two phases a rule may run in: over the declared values before anything is emitted, or over the emitted artifact. The fold is what makes the first phase possible without running the files. |
| Profile | A named subset of the specification an implementation may claim. There are two, full and data-host. |
| Reference implementation | `@intentius/tsad-reference`, an evaluator written from the specification text and nothing else, used to check the text is complete enough to implement from. |
| Rule over values | A check over what a project declares, across files and resources, as opposed to a type check on one value; tools call it semantic linting. chant's lexicon rules and forgejo-warden's guardrails are examples; the specification defines only the contract they run under. |
| Run | The fallback when a file cannot be folded. The JavaScript engine executes the file and the tool takes whatever the exports hold at the end; the verdict's reason names the line that made the file a program. |
| Serializer | The part of a host that turns folded values, envelopes included, into the artifact. |
| Verdict | The specification's answer for one file, `fold` with the exports or `run` with a reason. |
| YAML | The text format most deploy tools read their settings from. It nests by indentation and pairs each key with a value, and nothing in it can check a key exists. |
