---
title: "TypeScript as data: a specification for building JSON and YAML compilers, with a specified fallback"
author: "INTENTIUS"
date: "Draft for comment, September 2026"
---

## Abstract

Infrastructure and build configuration is increasingly written in a general-purpose language, and then must not be run, because a build that executes its own configuration has output nobody can reproduce or audit line by line. The usual answer is a configuration language, total by construction, in which unsupported source is a syntax error. This paper specifies and implements a different answer. A fragment of TypeScript is carved out whose value is fixed by its source; source inside the fragment is reduced to data without executing it; source outside it falls back to real execution; and the two paths are required to agree. This is offline partial evaluation with a binding-time analysis, the shape classifier being the analysis and the reducer the specialiser. Fallback from static evaluation to execution is known, per call site in compile-time function execution and per page in static site rendering. What is new is per-file granularity with object identity shared across the boundary, and the bidirectional fixpoint that keeps a shared entity from becoming two objects. We give the specification as a grammar and four judgments with named rules, a reference implementation written from the text, a second evaluator in Rust for the profile that needs no JavaScript runtime, and a conformance suite that a production system passes beside both. Over the 441 files of that system's corpus the reference and the production system agree on every comparable file, and again over two projects nobody on the team maintains.

## 1. Introduction

Configuration as data is auditable: every value traces to a line of source, the build makes no network call and holds no credential, and the same file gives the same artifact anywhere. Configuration as code is expressive, with types and refactoring in a language people already know. Existing designs pick one. A configuration language gives up the general-purpose ecosystem, and a program that emits configuration gives up auditability, because the graph exists only as the output of a run.

A fragment of an existing language promises both. Defining the fragment is routine; defining its edge is the work. A total language never has to say what happens to source it cannot evaluate, because that source does not compile. A system with a fallback must say it, and three obligations follow.

The two paths must agree. Folding a file and running it must be observationally equivalent at a fixed binding of build parameters, which means stating what still executes when a file folds: none of its own statements, but the constructor a name resolves to.

The decision must be total per unit. A file folds entirely or runs entirely, since a partly folded namespace is a half-built object graph.

Identity must survive the boundary. If one file folds and another runs, and both refer to an entity the first produced, the build holds two objects for one entity. Compile-time function execution copies values across its boundary, per-page rendering shares no runtime objects, and a whole-program partial evaluator has a single heap; only a per-unit decision over a shared object graph has the problem. The answer is a fixpoint over the module graph closed under two edges, a running file tainting what it imports and a file whose objects were captured tainting the capturer, with a third edge through calls. We found no precedent for it.

We provide the specification, versioned and tagged. A reference implementation is written from its text, covering the expression layer through the fixpoint, and a second evaluator in Rust serves the profile without a runtime and compiles to a WebAssembly module with no imports. A conformance suite holds every rule to a fixture and every fixture to a real rule. The measurements come from chant, the production system the subset was extracted from. Rule identifiers such as `F-Total` name rules of the specification; appendix A lists the ones used here, and appendix B the artifacts every number was taken from.

The corpus is chant's own examples with two small external projects beside it. Fixture coverage is 135 of 139 rules, the four left being properties no verdict can witness. The specification was written by reading chant, and the reference was rewritten from the text by an author who had read chant closely.

## 2. The mechanism

### 2.1 Two layers of admissibility

A file is admitted in two stages. The statement gate examines only exported statements and recognises six shapes.

| Shape | Example |
|---|---|
| a construction bound to a `const` | `export const b = new Bucket({…})` |
| any other `const` initializer | `export const web = Stack({…})` |
| a destructured export | `export const { a, b } = Stack({…})` |
| a local export list | `export { a, b }` |
| a re-export | `export { a } from "./m"` |
| an exported function | `export function f() {…}` |

In the profile without a runtime, `export default` is a seventh. Six other shapes disqualify the whole file, a star re-export and an exported class among them. Non-exported statements are invisible to the gate and never execute; a bare call at the top of a file is read past, and section 6.4 shows what that means in practice. The gate is per module because an unfoldable export can reference a foldable one, or be referenced by it, in ways that only running proves safe, and a half-reduced namespace is not coherent (`F-Total`).

The expression classifier then decides the shapes inside an admitted statement. It resolves nothing, which is the subject of section 2.3.

### 2.2 Two sub-grammars

Two statement-level grammars govern what may appear inside a function the reducer evaluates, both narrower than the module gate. A project-local function is admissible when its parameters bind plainly and its body is a single expression or `const` declarations followed by one `return`: no generator, no `async`, no early return, no `let`. A composite factory is admissible under the same shape except that its body must end in `return`. Inside either body, five constructs that reduce at a file's top level are refused; a construction is one and the `.step` idiom another. Each would produce an envelope revived against the caller's imports, which is not the scope the body was written in. Admissibility is a property of a construct in a position.

### 2.3 One classifier and two consumers

The subset has one definition and two consumers. A lint pass reads it without a binding resolver or a registry; an evaluator reads it with both. They will disagree, and the specification constrains how.

If evaluation succeeds, classification accepts, with two exceptions. The classifier is flow-insensitive, so it requires every branch of a short-circuiting operator to be admissible where the evaluator reduces only the taken one, and `false && f()` is a lint error on source that reduces cleanly. And the classifier takes the intrinsic registry as an optional parameter, so without one a call form the registry would admit is refused.

The direction is chosen for its cost. A classifier that accepts too much produces a fallback the author learns about from a per-file decision line. A classifier that rejects too much produces an error on correct source, and a lint that cries wolf gets disabled. The classifier is also how a downstream tool asks whether a file will reduce without reducing it, and that answer must be safe to act on.

Twelve divergences run the permitted way, and the specification enumerates them, because a claim that two analyses disagree in one direction is only checkable against the list.

| Rule | The classifier sees | The evaluator additionally requires |
|---|---|---|
| `F-Div-Ident` | any bare identifier | that it resolves, and is not an ambient environment read |
| `F-Div-Tag` | any tagged-template tag, interior opaque | that the registry admits the tag and the interior reduces |
| `F-Div-Provenance` | a registered helper name | that the name is unbound or imported from the host; a project binding is the project's function |
| `F-Div-SpreadType` | a spread operand of valid shape | that it reduces to an object, or an array for array spread |
| `F-Div-SameFileNew` | a bare identifier | that a name bound to a same-file construction is answered by the one pre-built instance |
| `F-Div-Nullish` | a member or element read | that the object is not nullish, unless the read is written `?.` |
| `F-Div-NsNew` | a construction with any callee | that the callee is a plain identifier |
| `F-Div-Method` | a method call | that the receiver is a real value with a callable of that name |
| `F-Div-Step` | any call narrowed to `.step` | that the callee is unclaimed |
| `F-Div-Depth` | five constructs that reduce at top level | that the expression is not inside a reduced function body |
| `F-Div-Eager` | a registered eager name | that it resolves to a function and is called rather than referenced |
| `F-Div-TemplateEnvelope` | an access or call inside a template span | that the span does not reduce to an envelope |

In every row the classifier decides from syntax while the evaluator consults something syntax cannot see. Each therefore costs coverage and never correctness, because a file the classifier passes and the evaluator refuses falls back instead of emitting anything. An implementation that finds a third exception has found either a bug or a row for this table.

### 2.4 The per-file verdict

Evaluating a single file yields either a reduction with a complete export namespace, or a fallback with a located reason. The verdict is total per file. Every fallback is reported, since an unreported one is indistinguishable from a reduction and the no-execution guarantee becomes unauditable; the reason names the construct and its position, and a failure inside a called function is re-anchored at the call site.

The verdict is parameterised by an isolation mode with three values. The default, `open`, executes no project code. Under `isolated`, a reduction that would have to invoke project-owned code falls back. Under `executing`, the one opt-in, a project function whose body cannot be reduced is invoked; the fold then carries what a run would have computed in the folding process. Section 6.4 records how this mode came to exist. The verdict is therefore not a pure function of the source.

All of this is a proposal. The fixpoint makes it final.

### 2.5 Identity across the boundary

Per-file partial evaluation is unsound when values have identity. Suppose file A reduces and file B falls back, and both refer to an entity that A produced. B's real import of A constructs a second copy, and the build holds two objects for one entity. Each entity is assigned a logical name when the build collects it, and attribute references hold a weak reference to the entity they belong to; only one of two copies is collected, so the other's references reach an entity with no name and serialisation fails, or a reference that should point at the collected entity inlines the uncollected one's value instead. Both were observed before the rule was written.

The fixpoint closes the tentative verdicts under two edges. The forward edge runs along imports; a running file taints what it imports, because its real import would construct what a folded copy already holds. Along captures runs the backward edge; a file whose objects were captured taints the capturer, because the instance the capturer holds is no longer the one the build collects. Calls carry a third, since a project-local function whose call returns a live object records the same capture. Seeded with every file that would not fold alone, the closure is a least fixpoint over a finite set. Two supporting rules make it sound: each file is evaluated at most once per build, and within a file a call reached through several member accesses is invoked once; without them a capture would record an edge to a copy.

Two consequences look like defects. A leaf fix buys nothing while an importer still falls back, and this was first observed as coverage falling after a widely imported file was made reducible. And a file's verdict is not a property of its own source, because through the backward edge a file that reduces cleanly can be forced back by something that captured one of its objects and then fell back. The second places an obligation on reporting: the reason must be able to say that a file fell back because another did and captured from it.

### 2.6 A worked example

![The fold and run boundary with both taint edges.](figures/taint-boundary.svg)

chant ships a build of four files whose verdicts its own test asserts by name.

```
shared-config.ts     export const sharedLabels = { … }        -- a plain object, has identity
                     export const sharedConfig = new ConfigMap({ labels: sharedLabels })

run-only-importer.ts import { sharedLabels } from "./shared-config"
                     function tier(n) { if (n > 1) return "ha"; return "single" }
                     export const x = new ConfigMap({ labels: sharedLabels, data: { tier: tier(2) } })

capturing-sibling.ts import { sharedLabels } from "./shared-config"
                     export const y = new ConfigMap({ labels: sharedLabels })

independent.ts       const localLabels = { … }                -- same VALUE, no shared identity
                     export const z = new ConfigMap({ labels: localLabels })
```

Judged alone, `run-only-importer.ts` fails. Its `tier` has an early return the function grammar excludes, so the call cannot reduce, and one failed declarator disqualifies the file. The other three succeed, and two of them capture `sharedLabels` from `shared-config.ts`.

The fixpoint seeds with the one failed file. The forward edge taints `shared-config.ts`, which the seed imports; reduced independently, its objects would be rebuilt by the importer's real import. The backward edge taints `capturing-sibling.ts`, which captured `sharedLabels` from a file that now runs, so the object it holds is not the object the build will collect. Nothing reaches `independent.ts`, which imports no sibling and captures nothing; its labels are the same value as the shared ones but not the same object, because the edge is identity and not equality. Three files run and one folds. The capturing sibling also imports the shared file, but that forward edge points from importer to imported and cannot carry taint back; only the capture edge can. The control file is what makes the example legible, since without it "taint forced three files to run" is indistinguishable from "this build does not reduce".

### 2.7 What a host supplies

A host provides seven things: the classes whose instances are entities and how they expose attributes; an intrinsic registry; an allowlist of authoring helpers; a trust set of packages; a registration form that makes a project-defined factory interpretable; and rules over the folded values, under a contract of their own. A registered call is admitted only if it is a pure function of its arguments and invoking it at fold time is indistinguishable from invoking it during a run, and revival always invokes the function the file imported.

Into a package, reduction goes only through a closed allowlist checked by name and by the provenance of the binding. Into a project file, reduction proceeds whenever the callee's body is itself in the subset, with no allowlist. The asymmetry follows the trust boundary. Package code is already loaded and executed by the build before reduction begins, to obtain the serialisers and lint rules the build cannot run without, so admitting a call into it costs no execution the process was not already performing. Project code is the untrusted input and is admitted only when it can be evaluated without being executed, which a syntactic check of the callee's body decides and an allowlist could not.

The generality is over host vocabularies and not over languages. The syntax is TypeScript's and the operator semantics are ECMAScript's, with two departures the specification names.

### 2.8 Two profiles

Everything above assumes a JavaScript runtime for the files the fold refuses. That assumption is a profile. The specification names it `full` and names a second, `data-host`, for an evaluator with no runtime embedded in a platform written in another language: a refused file is an error; the fixpoint is absent, since nothing runs and nothing can taint; revival is serialisation; helpers and eager intrinsics are absent; a composite is interpreted or refused, never invoked.

The split places the contribution. The identity property and the fixpoint live in `full`, because they exist to keep a folded object and a run object from coexisting. What survives into `data-host` is the expression layer and the per-file verdict, with the value domain and the host interface as a description; that is the portable product. One specification with two profiles is what lets the same rule identifiers govern a JavaScript tool with a fallback and a Rust crate without one.

## 3. Values, and the three ways a value is reached

### 3.1 The value domain

Reduction yields a value from a closed domain. Six cases are ordinary JSON, from scalars through arrays to plain objects. The other six are envelopes, non-array objects carrying one marker key, each denoting something the build has not yet constructed.

| Envelope | Denotes | Fate under revival |
|---|---|---|
| `__attrRef` | an attribute of another entity, resolved by the platform at apply | survives to serialisation |
| `__intrinsic` | a registered intrinsic, in tagged-template or call form | revived |
| `__helper` | a call to a registered authoring helper | revived |
| `__resource` | a construction, at a file's top level or nested as a value | revived |
| `__compositeStep` | a composite call narrowed to `.step` | revived |
| `__symbol` | source text preserved inside an intrinsic's interior | revived |

![Reduce to envelopes, then revive.](figures/two-phase.svg)

An envelope is a finished value. An attribute reference is not a thunk; it is the shape the runtime object serialises to, and the value it denotes does not exist at build time on either path. Revival replaces five of the six, resolving each name through the folding file's own imports and invoking the real function or constructor, and only the attribute reference reaches a serialiser; an implementation that emitted a resource envelope has produced wrong output, which a differential across a real corpus caught before the rule was written.

Validity is position-dependent. Inside the arguments of an intrinsic or a helper an attribute reference is refused, because the receiving function inspects what it is given and a look-alike plain object makes it produce wrong output. One position out, in a construction's props, the same value passes, because there the serialiser resolves it by name. So the rule is part of the domain.

Liveness is what makes the identity rules statable. A value carries a live object when it or anything reachable through plain objects and arrays has a prototype other than the plain ones, is a function, or carries a host's marker. Live objects reached through cross-file resolution pass through revival untouched, because a generic walk would rebuild them as plain copies and destroy the identity the fixpoint preserves.

Three smaller rules complete the domain. A callable is in the domain and is never a value: `f(x)` reduces where `{ resolver: f }` does not, because nothing can serialise a function. Constructor arity is contractual, so when the argument list is not a props object optionally followed by attributes, the positional list is authoritative. And absence has two forms, `undefined` in a property position being dropped at emission and in an array position becoming `null`, which platforms act on.

### 3.2 Three evaluation modes

Envelope, then revive. Reduction records what the source named and executes nothing; a second phase resolves each name through the folding file's own import declarations, imports that module, and invokes the real constructor with the reduced arguments. This is what makes the no-execution claim precise: none of the reduced file's own statements run, and what does run during revival is the module the fallback path would have imported, for the same purpose.

Interpret, without importing. A composite factory is evaluated rather than invoked when it is defined in the project's own source, registered in the form the host recognises, and its body stays inside the factory sub-grammar. Its defining module is never imported. Revival imports and calls; interpretation reads and evaluates. That is what lets a file reduce under isolation, and it has no analogue in the envelope path.

Evaluate eagerly. A registered function whose result is coerced to a string during reduction is called at reduction time, because an envelope deferred to revival would stringify as a placeholder; a method call on a real receiver is the same mode. Both run code the file imported. The eager mode exists to serve a coercion, and the specification says so.

## 4. What the fold gives a platform

Three capabilities follow, and neither a syntax linter nor a configuration language provides them.

Synthesis with no execution. A file in the subset becomes its artifact by being read, so the artifact is a function of the source and the build-parameter binding, and the same file yields the same artifact in any evaluator in any language. The user meets the fold as a lint that says while they type whether the file is data and which line makes it not data; that lint is the shape classifier, and it needs no evaluator.

Rules over values. A type can say a port is out of range. It cannot say that two fields of one resource contradict each other, or that a resource in one file makes a resource in another incoherent, because it lacks the values of every file in the build before anything is emitted. The fold has them. The specification defines no rule, only the contract a rule runs under: what it sees and when it runs, and what a finding carries. Rules over the emitted artifact need no fold; rules over the declared values do, and there references are still references and an entity is one entity wherever it is used, with nothing executed. The contract states as a property that findings are the same whether the build folded the file or ran it, and a finding is data carrying its rule and subject with a path into the value, which is what lets a person or an agent act on it.

Round-trip generation. A generator goes from data to source, and composed with the fold an existing artifact or a live system becomes source that folds back to what it came from. A generator decides what each value is, and each decision needs a source form the subset can express and the fold can reverse: a value that is another resource's attribute is `bucket.Arn`, and a repetition across forty resources is one `const` spread where it is used. YAML cannot express either, and a configuration language can only by leaving the artifact's own shape. The specification states the completeness half as a rule, one source form per case of the domain, and holds a generator to the fidelity half through a fixture kind whose input is a namespace as data.

The first two need only `data-host`. None of the three needs the fallback or the fixpoint; those exist so that source outside the subset can still be built by an implementation that has a runtime, and they are what this paper is about.

## 5. Two properties

### 5.1 One instance per entity

Let a build be `B = (F, →, P)`, the finite set of discovered project files with the import and re-export edges between them and the binding of build parameters. The per-file judgment gives tentative verdicts. The fixpoint gives final ones by computing `T(B)`, the least set containing every file that fails alone and closed under the forward and backward edges. Let `e` be an entity produced by file `g`.

Claim. Exactly one object represents `e` in the build, and every reference to `e` resolves to that object.

Proof sketch. If `g ∉ T(B)`, then `g` folded and `e` is the object in its namespace; memoisation makes it unique within the build and the once-per-call-site rule within the file. Take any `f` referring to `e`. A folded `f` captured from `g`, so `g` is a successor of `f`, and `f ∈ T(B)` would put `g ∈ T(B)`, a contradiction; so `f` holds the memoised object. A running `f` imports `g`, so again `g` would be in `T(B)`; so no referrer runs. If `g ∈ T(B)`, then `g` runs and execution constructs `e`. A referrer that imports `g` cannot be outside `T(B)`, so it runs and imports `g` through the host module system, one module instance per file; a referrer that captured from `g` is in `T(B)` by the backward edge, and its folded capture is discarded. In neither case do a folded object and a run object for `e` coexist.

The sketch assumes memoisation and the once-per-call-site rule hold in the implementation, that the run path yields one module instance per file, and that `T(B)` exists and is finite. The first prose statement of the forward edge had its direction reversed; writing the successor relation as an operator caught it.

The reference computes `T(B)` by a worklist from the seed, and whole-build fixtures hold it to each edge: a file that seeds with no edge; the forward edge into an import; the backward edge two hops out through a capture; and a control, the file nothing reaches, which must still fold. Falling back on everything satisfies the claim, so the control is the assertion that discriminates. chant answers the same fixtures, and the two agree on every file's final verdict and its verdict before taint, and for each casualty on the file the edge came from and the rule.

### 5.2 The permitted direction of divergence

Let `shape(e, ρ)` be the classifier's verdict on expression `e` with optional registry `ρ`, and `fold(e, Γ, ρ)` the evaluator's.

Claim. For all `e`, `Γ` and `ρ`, if the fold succeeds then the classifier accepts, except when an operand or branch the fold never evaluates is outside the subset, or the registry is absent while `e` is a call form the registry would admit.

Proof sketch. Both consumers import one classifier, so every syntactic question has one answer by construction. Every remaining disagreement is a resolution the classifier does not perform, enumerated as the twelve rows of section 2.3, each a rejection by the fold of something the classifier accepted. The two exceptions are the only sites where the fold accepts something the classifier rejects.

Corollary. Every disagreement outside the two exceptions costs coverage and never correctness: a file the classifier passes and the fold rejects falls back to run.

### 5.3 The round trip

For every value `v` the domain admits, `fold(generate(v)) = v` in `data-host`, and equals the revived value in `full`. Completeness is a rule, a table with one source form per case of the closed domain, each folding to its value by the rule the table cites. Fidelity is an obligation on each generator, that its output is in the subset and folds to its input, tested through a fixture kind whose input is a namespace as data. The reference and the Rust evaluator each carry the smallest generator that makes the property testable, and the four round-trip fixtures pass on both.

Mechanisation is declined for the submission. The first property has the argument above and three executed artifacts: the differential over every corpus entry including the mixed ones; an adversarial build that fires both taint edges; and a second implementation held to whole-build fixtures. The second has the shared-classifier construction and the enumerated table with a fixture per row.

## 6. Evaluation

Every number names the artifact it comes from and the version it was taken at; appendix B collects them. None is a coverage ratio, because coverage is adoption and not mechanism.

### 6.1 The differential and the adversarial entry

chant builds every corpus entry twice, folded and run, and requires identical errors and byte-identical serialised output. The error half was unsound until chant `0.69.1`: a module that threw during import was cached as evaluated under the test runner, so the second build of a directory in one process reported no error. Until chant `0.65.0` the differential compared only entries where every file folded, which are the builds in which the fixpoint does nothing. The twelve mixed entries are the only builds in which `T(B)` is non-empty, and all twelve agree on both errors and bytes.

| Run | Entries | Fully folded | Mixed | Drift |
|---|---|---|---|---|
| first mixed-entry run, chant 0.65.0 | 107 | 95 | 12 | 0 |

One entry is nine files, each named for a resolution-time decision point and citing the inventory row that governs it. Four make the fixpoint fire on purpose, and section 2.6 walked through them; the entry asserts each verdict by name and the differential holds across it.

### 6.2 The execution boundary

A profiling harness expresses one estate in chant and again in CDK, profiles both synths under the JavaScript engine's CPU profiler, and applies one analyser to both.

| Measurement | chant, folding | `cdk synth` |
|---|---|---|
| project code executed | false | true |
| definition-library code on the path | 0 MB | about 1.7 MB |

The chant side's `false` is an unsampled invariant: the run fails unless every file reports a fold. A second test asserts over the corpus that under isolation nothing from a project's source directory is imported into the build's process.

### 6.3 The conformance cross-check

The conformance package runs the specification's fixtures against the reference and against chant through its public entry, pinned to a release.

| Pin | Fixtures | Rules with a fixture | Agreement |
|---|---|---|---|
| chant 0.72.3 | 127, of which 65 are whole-build | 135 of 139 | all, on every fixture but the four round-trip ones, which skip at chant for want of a generator |

The four rules without a fixture are provenance, the host's own module tree, and what a host may vary or must not execute. One disagreement existed, on an envelope inside a template span; the specification recorded the recommendation, chant `0.68.0` implemented it, and a fixture pins it.

The reference judged in `data-host` passes every fixture tagged for it, which establishes that the profile is consistent. Whether it is implementable without an engine is what the Rust evaluator establishes. Written from the text on the oxc parser, it passes every fixture tagged for the profile and agrees with the reference on each; compiled to WebAssembly with no imports, the same crate passes the same fixtures and agrees with its own binary answer for answer. Over chant's corpus it is a third column, both evaluators judged in `data-host` on the same host description, agreeing on all 441 files, with 142 folding on both sides to the same namespace. Writing it found the reference reviving and tainting in a profile that does neither, both fixed.

Thirteen expression fixtures pin the parts of ECMAScript an evaluator in another language has to reproduce bit for bit. Number formatting in template literals is the largest of them. The others cover the arithmetic and relational operators' coercions and the logical operators returning an operand, plus the one deliberate departure, array spread refusing a string. All three evaluators agree on all thirteen.

Until the rewrite, the reference's evaluation layer was a port of chant's, and agreement was guaranteed by construction. chant `0.69.0` extended an envelope check from three kinds to five while the port still had three, and because no fixture covered the shape the suite stayed green until the drift was found by reading the release diff. The reference is now written from the grammar and the judgments without consulting chant's source, and two fixtures cover the shape.

### 6.4 The corpus cross-check

The conformance package runs chant's example corpus through both implementations and compares verdicts file by file, and export namespaces where both folded. The entries are the ones chant's own differential enumerates, and the reference is given chant's host assembled from chant's own registries.

| Corpus | Files | Comparable | Agreed | Both fold, namespaces identical |
|---|---|---|---|---|
| chant 0.70.1, 108 entries | 409 | 65 | 65 | 50 |
| chant 0.71.0, 109 entries, before the call rule | 441 | 150 | 150 | 118 |
| chant 0.71.0, with the call rule | 441 | 372 | 372 | 258 |
| chant 0.72.1, specification 1.6 | 441 | 440 | 440 | 304 |
| chant 0.72.3, specification 1.8 | 441 | 440 | 440 | 304 |

A file is comparable when nothing disarmed either implementation before the comparison. Four things did at the first pin and one remains, the single file that imports a package the reference's host cannot load. Two were limits of chant's entry point, 52 files reading a host export that needed a lexicon list and 19 in entries with build parameters the entry could not be given, until chant `0.71.0` took both; one held 290 files reaching a host factory until the reference implemented the call rule; the last held 68 files calling a package export outside a declarator, until specification `1.6` wrote chant's behaviour into the declarator and call rules.

On 440 files nobody wrote for the purpose the two implementations agree on every verdict, and on the 304 that fold on both sides the namespaces are structurally identical, entity class and properties included. A limit is an over-approximation, so the one file outside the set may hide a disagreement. And chant is the implementation the text was extracted from, so this is agreement with a rewrite written from the text, not between two independent readings.

Every entry above was written by the people who wrote the folder. Two public projects that depend on chant and are not maintained by us run beside it at a pinned revision, each directory with a configuration file an entry.

| Checkout | Entries | Files | Comparable | Agreed | Both fold |
|---|---|---|---|---|---|
| a home Kubernetes estate, 16 apps | 16 | 19 | 12 | 12 | 9 |
| an Infisical deployment | 6 | 31 | 13 | 13 | 5 |

The host limit is large there because both were written against an older chant, so a package export the pinned release no longer has disarms every file that imports it. The first run found one disagreement: a file whose only declarator called a project function that reads the process environment. chant folded it by invoking the function at fold time, and the fold's output carried whatever the folding shell held. The specification routes a declared function to the project-local call rule, whose ambient read is a pointed rejection, so the file runs. chant `0.72.3` does the same, and specification `1.8` made the old behaviour the opt-in mode of section 2.4.

The runs found things on the way. The first run had no host and compared seven files, none of which folded on either side. With a host it found a reference bug, the capture walk stopping at an entity's boundary; a specification defect, a rule that read an instance as pre-built that no rule built; and 21 files on which the harness had asked the two implementations different questions. The second exposed 79 more files and 10 disagreed, all in the harness or the reference. The third implemented the call rule and exposed 290, among the fallout a liveness test that was prototype-only where the host's marker was the rule. The fourth settled the last 68 with a rule written to what chant does, after a first draft folded five shapes chant refuses and the fixture cross-check caught it before the corpus could.

### 6.5 What the specification found

| Finding | Outcome |
|---|---|
| a property read on `null` folded to `undefined` where running throws | fixed in chant 0.63.0 |
| the differential skipped every mixed entry | fixed in chant 0.65.0 |
| an envelope in a template span coerced to `"[object Object]"` on both paths | fixed in chant 0.68.0 |
| interpretation depth exhaustion degraded silently | fixed in chant 0.68.0 |
| three stale documentation claims, one in a shape the parity gate could not see | fixed |
| the forward taint edge stated backwards in the specification's own prose | caught by writing the successor relation as an operator |
| four normative sentences used an unclaimed callee and none defined it | found by writing the reference from the text; a rule added |
| two identity predicates stated for captures and never reconciled | found by writing the fixpoint from the text; a rule added |
| a module that threw at import was cached as evaluated | fixed in chant 0.69.1 |
| a declared project function with an unfoldable body was invoked in open mode | found by the external corpus; fixed in chant 0.72.3; an opt-in mode in specification 1.8 |

chant's coverage history also records that its predictions about which change would unblock folding were mostly wrong. The change it had called the single biggest lever moved one entry of 107; two later changes moved 21 each. The corpus is chant's own examples, and its documentation says the number estimates nothing beyond them.

### 6.6 Limits

Twelve mixed entries and one adversarial build are a small sample from one project, and the external rows add 50 files from two more, both written against an older chant. The reference never invokes a project module, so the open mode's invocation of a registered composite that cannot be interpreted, and the `executing` mode, are the two things it reports as unavailable. The rewrite found three gaps in the text, the sample a single team produces.

## 7. Related work

Compile-time function execution. D, Zig, Rust and C++ evaluate a function at compile time when its inputs are static and at run time otherwise. D's specification states the principle this work relies on, that a function's semantics cannot depend on compile-time values, so the calling context alone decides where it runs; the no-substitution rule is that principle as a rule. CTFE decides per call site where this work decides per file, and a CTFE'd value is copied into the compiled program, so nothing at run time shares identity with a compile-time object. D also treats an unevaluable required context as an error where this work requires a fallback.

Separate partial evaluation. Heldal and Hughes treat a program as modules that can be specialised independently, with the program arriving one module at a time or static data split into data modules with one residual module each. Neither is a per-module choice between specialising and not, and the setting is a functional language without object identity. This reading is from the published abstracts; the full text is a citation to confirm.

Partial evaluation and binding-time analysis. The shape classifier is a binding-time analysis and the fold is the specialiser in the sense of Jones, Gomard and Sestoft. The per-file verdict with taint is closer to an online decision over a coarse unit, and forcing a folded file back to run is a coarse lift. Multi-stage programming makes staging explicit instead of inferring it.

Partial evaluation of JavaScript. Prepack evaluates a bundle's global code, captures the heap, and emits a residual program that rebuilds it, with abstract values for what it cannot evaluate and always one program. Its residual-heap visitor emits a shared object once, which is identity within one heap, the case a per-file split gives up.

Per-unit static or executed. Next.js decides per page whether to prerender or render on request, from a marker the author writes, and Astro's hybrid mode is the same shape; prerendered and served pages share no runtime objects, and no agreement obligation is stated.

Evaluation that escapes into execution. Nix's import-from-derivation pauses evaluation to realise a store object in a sandboxed and content-addressed build, then resumes. This is the precedent for the isolated mode.

Total configuration languages.

| Language | Recursion | Side effects | Out-of-subset source |
|---|---|---|---|
| Starlark | no | no | error |
| Dhall | no | no | error |
| CUE | no general recursion or functions | no | error |
| Jsonnet | yes, lazy | no | error |
| Nickel | yes | constrained to commutative | error |
| Pkl | yes | no | error |

Every row answers unsupported source with an error and so has neither an agreement problem nor an identity problem; the fallback is what removes that simplification. Pkl and CUE give a platform typed, deterministic configuration that emits YAML or JSON, and Pkl puts value constraints in the type where this work puts them in a pass over folded values. Neither makes the authoring surface the artifact's own shape: a Pkl or CUE file is a second grammar pointed at the spec, where a typed object literal is the spec with its keys unquoted. Pkl's bindings for other languages shell out to an evaluator binary; `data-host` is what lets an evaluator for this subset be a library in the platform's own language, or a WebAssembly module inside it.

Infrastructure tools. CDK, Pulumi and Alchemy execute the program that builds the resource graph. Terraform evaluates HCL with functions against state. Formae compiles Pkl to data.

Claimed as new. Per-file partial evaluation with a fallback is precedented in shape and in principle, and same-function agreement through revival is CTFE's design principle. Byte-identical agreement as a tested property over a corpus was not found stated elsewhere. The claim is per-file granularity with identity shared across the boundary, made sound by a taint fixpoint that runs both ways, for which no precedent was found.

## 8. Discussion

Costs. Section 2.5 named two. A third is that coverage is not the security-relevant number: a file that folds executes none of its own code either way, so partial coverage does nothing for the files that matter, and isolating the fallback is what bounds the remainder, which is why isolation is a mode of the verdict rather than a deployment detail.

Unresolved. Three places where the implementation settled a question by accident, recorded as such. The classifier is flow-insensitive, and making it flow-sensitive means writing an evaluator inside a lint rule. One member name, `.step`, is admitted after a call because one idiom uses it, and no principled boundary admits it and excludes the next member somebody needs. And one class of registered call is evaluated at fold time because its usual use coerces the result to a string.

What would falsify the identity property. A fold-run disagreement on a mixed build. An entity reachable by two paths with different verdicts, which memoising per referrer or invoking a composite once per member access would produce and the corpus would not necessarily catch. A sharing relationship the capture set does not record; nothing currently searches for a third route into another file's objects.

What changed while this draft was written. Two things it once asked for now exist. An evaluator with no JavaScript engine tests the coercion fixtures in a way a JavaScript implementation cannot, and it agrees. A corpus nobody here maintains found, on its first run, a case where the production implementation executed project code the specification says to refuse. The remaining ask is source written against the specification by someone who has not read the implementation, in volume.

## 9. Conclusion

The subset is not the contribution; six languages have carved one more completely. The contribution is the edge: a file folds entirely or runs entirely, the two paths agree at a fixed binding, and identity survives because a fixpoint over the module graph refuses to let a folded object and a run object stand for one entity. The evidence is a specification with named rules and a reference written from its text, a second evaluator in another language for the half that transfers, and agreement with a production system on every comparable file of 441.

## Appendix A. Rule identifiers used in this paper

| Identifier | What it states |
|---|---|
| `F-Total` | a file folds entirely or runs entirely |
| `F-Div-*` | the twelve enumerated divergences of section 2.3 |
| `F-Seed`, `F-Succ`, `F-Taint`, `F-Fix` | the fixpoint's seed, its two edges, its closure and its least-fixpoint form |
| `F-Capture`, `F-CallLeak` | what records a capture, through an import and through a call |
| `F-Memo`, `F-Count` | one evaluation per file per build; one invocation per call site |
| `F-Call` | a call in declarator position: fold, interpret, refuse under isolation, or invoke |
| `F-IsolatedRefusal` | under `isolated`, a fold that would invoke project code falls back |
| `F-NoOwnExecution` | none of a folded file's own statements execute |
| `F-Obs-Report` | every fallback is reported with a located reason |
| `F-Val-Domain`, `F-Val-Envelope`, `F-Val-Fate` | the closed value domain, its six envelopes, and which survive revival |
| `F-Val-Source` | every value of the domain has a source form that folds to it |
| `F-Host-Interface`, `F-Host-Admission`, `F-Host-NoSubstitution` | what a host supplies, what a registered call must satisfy, and that revival invokes the imported function |
| `F-Profile`, `F-Profile-DataHost` | the two profiles |
| `F-Rule-*` | the contract a rule over values runs under |
| `S-Module`, `S-FnBody`, `S-FactoryBody` | the statement gate and the two function sub-grammars |

## Appendix B. Artifacts

The specification is at version `1.8`, tagged `spec-1.8`, in the typescript-as-data repository under the INTENTIUS organisation. The reference implementation and the conformance suite sit beside it with the Rust evaluator, and the two packages are published to npm at `1.8.0`. Every number in section 6 was taken on 13 September 2026 with chant pinned at `0.72.3` and the corpus at that release's revision, from the corpus report committed there; the external checkouts are pinned by revision in the conformance package's manifest. The documentation site renders every figure from those artifacts at build time, and one of its pages folds a file in the reader's browser with the WebAssembly evaluator.
