# Introduction

Draft for #52. The claim in a page, narrowed to what the evidence supports.

## Abstract

Infrastructure and build configuration is increasingly written in a general-purpose language, and then must not be run: a build that executes its own configuration is a build whose output cannot be reproduced or audited line by line. The standard answer is to invent a language. Every widely used configuration language defines a total one in which unsupported source is a syntax error; `related-work.md` tabulates six of them.

This paper describes a different answer, specified and implemented: carve a fragment out of TypeScript whose value is fixed by its source, reduce source inside the fragment to data without executing it, and let source outside the fragment fall back to real execution, with the two paths required to agree. This is offline partial evaluation with a binding-time analysis, where the shape classifier is the analysis and the reducer is the specialiser.

Graceful fallback from static evaluation to execution is not itself new; compile-time function execution has it per call site and per-page static optimisation has it per page. What is new is the combination of per-file granularity with shared object identity across the fold and run boundary, and the bidirectional fixpoint required to keep a shared entity from becoming two objects. We give a specification of that combination, a reference implementation written from it, and a conformance suite that a production system passes alongside the reference.

## The problem

Configuration as data is auditable: every value traces to a line of source, and the build makes no network call and holds no credential. Configuration as code is expressive: types, imports, refactoring, a language people already know. Existing designs pick one. A configuration language gives up the general-purpose ecosystem; a program that emits configuration gives up the property that made data worth having, because the graph exists only as the output of a run.

The fragment approach promises both. Its difficulty is not defining the fragment, which is routine, but defining the edge.

## The edge is the contribution

A total language never has to answer what happens to source it cannot evaluate, because that source does not compile. A system with a fallback must answer it, and three obligations follow.

**The two paths must agree.** Folding a file and running it must be observationally equivalent, at a fixed build-parameter binding. Stating this precisely means stating what still executes when a file folds: the file's own statements do not, but resolving a name to its real constructor and invoking it does.

**The decision must be total per unit.** A file folds entirely or runs entirely. Partial folding would mean holding a half-built namespace.

**Identity must survive the boundary.** This is the obligation with no precedent we found. If one file folds and another runs, and both refer to an entity the first produced, the build holds two objects for one entity. Attribute references cannot both receive a logical name; a reference to one silently inlines rather than referring. Every comparable system avoids this by construction: compile-time function execution copies values across its boundary, per-page rendering shares no runtime objects, and a whole-program partial evaluator has a single heap. Only a per-unit decision over a shared object graph has the problem at all.

The answer is a fixpoint over the module graph, closed under two edges: a running file taints what it imports, and a file whose objects were captured taints the capturer. A third edge runs through calls rather than imports.

## What we provide

A specification of the subset and its edge, as a grammar and four judgments with identified rules. A reference implementation of the expression layer, written from the specification text. A conformance suite in which every rule is cited by the fixtures that exercise it, and a ledger in which every decision point of a production implementation cites the rule that governs it. And measurements from that production implementation: a differential over 107 corpus entries requiring identical errors and byte-identical output, an execution-boundary measurement, and a build designed to make the fixpoint fire in both directions.

## What we do not claim

The corpus is the production implementation's own examples. Fixture coverage is partial. The reference implementation covers the expression layer, so the identity theorem rests on one implementation's evidence. The specification was written by reading that implementation, and the independent rewrite that followed found one gap in it, which is the sample size a single author produces. `measurements.md` states each of these where the number appears.
