---
title: "TypeScript as data: a specification for building JSON and YAML compilers, with a specified fallback"
author: "INTENTIUS"
date: "Extended draft for comment, September 2026"
---

## Abstract

Infrastructure and build configuration is increasingly written in a general-purpose language, and then must not be run. A build that executes its own configuration is a build whose output cannot be reproduced or audited line by line. The usual answer is to invent a language, and every widely used configuration language defines a total one in which unsupported source is a syntax error. This paper describes a different answer, specified and implemented. A fragment of TypeScript is carved out whose value is fixed by its source; source inside the fragment is reduced to data without executing it; source outside it falls back to real execution; and the two paths are required to agree. This is offline partial evaluation with a binding-time analysis, where a shape classifier is the analysis and the reducer is the specialiser. Fallback from static evaluation to execution is not new. Compile-time function execution has it per call site and per-page static rendering has it per page. What is new is the combination of per-file granularity with shared object identity across the boundary, and the bidirectional fixpoint required to keep a shared entity from becoming two objects. We give a specification of that combination as a grammar and four judgments with named rules, a reference implementation written from the text, a second evaluator in Rust for the profile that needs no JavaScript runtime, and a conformance suite that a production system passes beside both. Over the 441 files of that system's corpus the reference and the production system agree on every comparable file, and they agree again over two projects nobody on the team maintains.

## 1. Introduction

Configuration as data is auditable. Every value traces to a line of source, the build makes no network call and holds no credential, and the same file gives the same artifact anywhere. Configuration as code is expressive. It has types and refactoring in a language people already know. Existing designs pick one. A configuration language gives up the general-purpose ecosystem; a program that emits configuration gives up the property that made data worth having, because the graph exists only as the output of a run.

The fragment approach promises both. Its difficulty is not defining the fragment, which is routine, but defining the edge. A total language never has to answer what happens to source it cannot evaluate, because that source does not compile. A system with a fallback must answer it, and three obligations follow.

The two paths must agree. Folding a file and running it must be observationally equivalent at a fixed binding of build parameters. Stating this precisely means stating what still executes when a file folds. The file's own statements do not; resolving a name to its real constructor and invoking that constructor does.

The decision must be total per unit. A file folds entirely or runs entirely, because a partly folded namespace would be a half-built object graph.

Identity must survive the boundary. This is the obligation with no precedent we found. If one file folds and another runs, and both refer to an entity the first produced, the build holds two objects for one entity. Attribute references cannot both receive a logical name, and a reference to one silently inlines rather than referring. Every comparable system avoids this by construction. Compile-time function execution copies values across its boundary, per-page rendering shares no runtime objects, and a whole-program partial evaluator has a single heap. Only a per-unit decision over a shared object graph has the problem at all. The answer is a fixpoint over the module graph closed under two edges, a running file taints what it imports and a file whose objects were captured taints the capturer, with a third edge running through calls rather than imports.

### 1.1 What we provide

A specification of the subset and its edge, written as a grammar and four judgments with identified rules and kept under version tags. A reference implementation written from the specification text and nothing else, covering everything from the expression layer to the fixpoint; it carries revival and a rules contract and a generator as well. A second evaluator, in Rust with no JavaScript runtime, for the profile of the specification that needs none; the same crate compiles to a WebAssembly module with no imports. A conformance suite in which every rule is cited by the fixtures that exercise it and every fixture cites a real rule, and a ledger in which every decision point of a production implementation cites the rule that governs it. And measurements from that production implementation, chant, from which the subset was extracted. A differential over 109 corpus entries requiring identical errors and byte-identical output; an execution-boundary measurement; a build designed to fire the fixpoint in both directions; and a cross-check in which the reference and chant judge the same 441 files and agree on every one the reference can answer.

### 1.2 What we do not claim

The corpus is chant's own examples, with two small external projects beside it. Fixture coverage is 135 of 139 rules; section 6 says which four are left and why no fixture can reach them. The specification was written by reading chant, and the reference was rewritten from the text by an author who had read chant closely; the rewrite found three gaps in the text, which is the sample a single team produces. The evaluation section states each of these where the number appears.

### 1.3 How to read this draft

Section 2 is the mechanism, section 3 the value domain and the three ways a value is reached, section 4 what the fold gives a platform, section 5 the two properties and their arguments, section 6 the evaluation, section 7 related work and section 8 discussion. Rule identifiers such as `F-Total` name rules of the specification; appendix A lists every one used here in a line each, and appendix B names the artifacts and the versions every number was taken at.

## 2. The mechanism

### 2.1 Two layers of admissibility

A file is admitted in two stages, and the first is easy to miss because it is not about expressions.

The statement gate examines only exported statements, and recognises six shapes.

| Shape | Example |
|---|---|
| a construction bound to a `const` | `export const b = new Bucket({…})` |
| any other `const` initializer | `export const web = Stack({…})` |
| a destructured export | `export const { a, b } = Stack({…})` |
| a local export list | `export { a, b }` |
| a re-export | `export { a } from "./m"` |
| an exported function | `export function f() {…}` |

Since specification `1.2`, `export default` is a seventh, in the profile without a runtime. Six other shapes disqualify the whole file, a star re-export and an exported class among them. Non-exported statements are invisible to the gate, neither admitted nor disqualifying, and they never execute; a bare call at the top of a file is read past, and section 6 shows what that means in practice.

The gate is per module rather than per declaration. An unfoldable export can reference a foldable one, or be referenced by it, in ways that only running proves safe. A per-declaration gate would then have to decide whether a half-reduced namespace is coherent. It is not, and `F-Total` says so.

The expression classifier then decides the shapes inside an admitted statement. It resolves nothing, which is deliberate and is the subject of the direction claim below.

### 2.2 Two sub-grammars, and an asymmetry

Two statement-level grammars govern what may appear inside a function the reducer evaluates, and both are narrower than the module gate. A project-local function is admissible when its parameters bind plainly and its body is a single expression or `const` declarations followed by one `return`; no generator, no `async`, no early return, no `let`. A composite factory is admissible under the same shape with one difference, that its body must end in `return`. The two disagree on exactly that point and the specification says so rather than harmonising them.

Inside a function body, five constructs that reduce at a file's top level are refused: a construction or a tagged template, a helper or intrinsic call, and the `.step` idiom. Each would produce an envelope revived against the caller's imports, which is not the scope the body was written in. Admissibility is therefore a property of a construct in a position rather than of a construct alone.

### 2.3 One classifier, two consumers, one permitted direction

The subset has a single definition with two consumers. A lint pass reads it without a binding resolver or a registry; an evaluator reads it with both. They will disagree, and the specification's job is to constrain how.

The claim is one-directional and stated with its exceptions inside it. If evaluation succeeds, classification accepts, except in two cases. The classifier is flow-insensitive, so it requires every branch of a short-circuiting operator to be admissible where the evaluator reduces only the taken one, and `false && f()` is a lint error on source that reduces cleanly. And the classifier takes the intrinsic registry as an optional parameter, so without one a call form the registry would admit is refused.

The direction is chosen rather than observed, and the reason is asymmetric cost. A classifier that accepts too much produces a fallback the author learns about from a per-file decision line. A classifier that rejects too much produces an error on correct source, and a lint that cries wolf gets disabled, taking the real diagnostics with it. The classifier is also how a downstream tool asks whether a file will reduce without running a reduction, and that tool must get an answer that is safe to act on.

Twelve divergences run the permitted way, and the specification enumerates all twelve rather than describing the shape of the set. The enumeration is the useful part. A claim that two analyses disagree only in one direction is worth little without a list of where, because the list is what a reader checks and what a new rule has to join.

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

Every row has the same shape. The classifier decides from syntax while the evaluator consults something syntax cannot see, a binding for instance or a runtime type. Each therefore costs coverage rather than correctness, because a file the classifier passes and the evaluator refuses falls back rather than emitting anything. The two rows that run the other way are the exceptions named above, and there is no third. An implementation that discovers one has found either a bug or a rule that belongs in this table.

### 2.4 The per-file verdict

Evaluating a single file yields either a reduction with a complete export namespace, or a fallback with a located reason. Three properties of that verdict matter downstream.

It is total per file. One unrecognised export disqualifies the whole module, and there is no partial namespace, which is what lets a referring file treat another file's result as wholly available or wholly absent.

Every fallback is reported. It is a normal outcome rather than an error, and that is exactly why it must appear. Left unreported, it is indistinguishable from a reduction, and the no-execution guarantee becomes unauditable. The reason is located, naming the construct and its position, and a failure inside a called function is re-anchored at the call site with the callee's own position carried in the message.

A third property is the isolation mode, which has three values. The default, `open`, executes no project code. Under `isolated`, a reduction that would have to invoke project-owned code falls back instead. Under `executing`, the one opt-in, a project function whose body cannot be reduced is invoked; the fold then carries what a run would have computed in the folding process. The verdict is therefore not a pure function of the source, and a specification that omitted the parameter would describe a judgment that behaves differently in any real deployment. Section 6.5 records how the third mode came to exist.

All of this is still a proposal. What makes a verdict final is the fixpoint.

### 2.5 Identity across the boundary

Per-file partial evaluation is unsound when values have identity, and this is the part with no precedent we could find.

Suppose file A reduces and file B falls back, and both refer to an entity that A produced. B's real import of A constructs a second copy, and the build now holds two objects for one entity. The failure this produces is specific. Each entity is assigned a logical name when the build collects it, and attribute references carry a weak reference to the entity they belong to. Only one of two copies is collected. The other's attribute references then reach an entity with no logical name, and serialisation fails outright. Where it does not fail, a reference that should point at the collected entity inlines the uncollected one's value instead, leaving output that is quietly wrong rather than absent. Both were observed before the rule was written.

The fixpoint closes the tentative verdicts under two edges. Forward, along imports, a running file taints what it imports, because its real import would construct what a folded copy already holds. Backward, along captures, a file whose objects were captured taints the capturer, because the instance the capturer holds is no longer the one the build collects. A third edge runs through calls rather than imports: a project-local function whose call returns a live object the body produced records the same capture, since invocation propagates identity the same way import does.

Seeded with every file that would not fold alone and closed under both edges, the set is a least fixpoint over a finite set, so it terminates. Two supporting rules make it meaningful. Each file is evaluated at most once per build, and within a file a call reached through several member accesses is invoked exactly once. Without those, a capture would record an edge to a copy.

Two consequences look like defects and are the rule working. A leaf fix buys nothing while an importer still falls back; making a leaf reducible changes no verdict until every file in the closure above it also reduces, and this was first observed as coverage falling after a migration that made a widely imported file reducible. And a file's verdict is not a property of its own source; through the backward edge, a file that reduces cleanly can be forced back because something else captured one of its objects and then fell back. Nothing in the first file predicts that, which places an obligation on reporting. The reason must be able to say that a file fell back because another did and captured from it.

### 2.6 A worked example

![The fold and run boundary with both taint edges.](figures/taint-boundary.svg)

The fixpoint is easiest to read on a build made to exercise it. chant ships one, four files whose verdicts its own test asserts by name.

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

Tentative verdicts come first, each file judged alone. `run-only-importer.ts` fails. Its `tier` has an early return the function grammar excludes, so the call cannot reduce, and one failed declarator disqualifies the file. The other three succeed. Two of them capture `sharedLabels`, a non-primitive, so the capture set records them against `shared-config.ts`.

Then the fixpoint. The seed is the one file that failed on its own. The forward edge taints `shared-config.ts`, which the seed imports; nothing about it resists reduction, and running it anyway is the point, since reduced independently its objects would be rebuilt by the importer's real import. The backward edge taints `capturing-sibling.ts`, which reduced cleanly and captured `sharedLabels` from a file that now runs, so the object it holds is not the object the build will collect. Nothing reaches `independent.ts`. It imports no sibling and captures nothing; its labels are the same value as the shared ones and deliberately not the same object, because the edge is identity and not equality.

Three files run and one folds. Note which edge does the third step. The capturing sibling also imports the shared file, and that forward edge points from importer to imported, so it cannot carry taint back; only the capture edge can, and without it the file would reduce while its source runs. The control file is what makes the example an example. Without it, "taint forced those three to run" is indistinguishable from "this build does not reduce".

### 2.7 What a host supplies

The subset is parameterised. A host provides seven things: the classes whose instances are entities, and how those expose attributes; an intrinsic registry; an allowlist of authoring helpers; a trust set of packages; a registration form that makes a project-defined factory interpretable; and rules over the folded values, under a contract of their own. A registered call is admitted only if it is a pure function of its arguments and invoking it at fold time is indistinguishable from invoking it during a real run, and revival always invokes the function the file imported rather than a reimplementation.

The interesting rule is an asymmetry between two kinds of callee. Into a package, reduction goes only through a closed allowlist that is checked by name and by the provenance of the binding. Into a project file, reduction proceeds whenever the callee's body is itself in the subset, with no allowlist at all. That looks backwards until the trust boundary is stated. Package code is already loaded and executed by the build before reduction begins, to obtain the serialisers and lint rules the build cannot run without; admitting a call into it costs no execution the process was not already performing, so it is admitted by declaration and verified by registration. Project code is the untrusted input, and it is admitted only when it can be evaluated without being executed, which a syntactic check of the callee's body decides and an allowlist could not.

The generality this buys is over host vocabularies and not over languages. The syntax is TypeScript's and the operator semantics are ECMAScript's, with two deliberate departures the specification names.

### 2.8 Two profiles, and which half is which

Everything above assumes a JavaScript runtime is available for the files the fold refuses. That assumption is a profile and not a premise. The specification names it `full` and names a second, `data-host`, for an evaluator that has no runtime and is embedded in a platform written in another language. The second is the first with the runtime removed. A refused file is an error rather than a demotion; the fixpoint is absent, since nothing runs and nothing can taint; revival is serialisation, since there is no constructor to call; helpers and eager intrinsics are absent; a composite is interpreted or refused and never invoked.

The split places the contribution precisely. The identity property and the taint fixpoint live in `full`, because they exist to keep a folded object and a run object from coexisting, and in `data-host` no object ever runs. What survives into `data-host` is the expression layer, the per-file verdict, the value domain and the host interface as a description, which is the portable product. Stating this as two profiles of one specification, rather than as a mechanism half of which does not transfer, is what lets the same rule identifiers govern a JavaScript tool with a fallback and a Rust crate without one.

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

An envelope is a finished value. An attribute reference is not a thunk; it is the same shape the runtime object serialises to, and the serialiser accepts it without a live instance. Describing envelopes as unevaluated invites an implementation that tries to force them, which is exactly wrong, because the value they denote does not exist at build time on either path and will not until the platform resolves it.

Exactly one survives. Revival replaces five of the six, resolving each name through the folding file's own imports and invoking the real function or constructor. Only the attribute reference reaches a serialiser. An implementation that emitted a resource envelope has produced wrong output rather than a placeholder, and a differential across a real corpus caught precisely that before the rule was written down.

Validity is position-dependent. Inside the arguments of an intrinsic or an authoring helper an attribute reference is refused rather than passed. The receiving function inspects what it is given, and a look-alike plain object makes it produce wrong output rather than absent output. One position out, in a construction's props, the same value passes untouched, because there the serialiser resolves it by name. A definition of the domain alone does not capture that, so the rule is part of the domain rather than a note about it.

Liveness is what makes the identity rules statable. A value carries a live object when it or anything reachable through plain objects and arrays has a prototype other than the plain ones, is a function, or carries a host's marker. Live objects reached through cross-file resolution pass through revival untouched, because the generic walk would rebuild them as plain copies and destroy the identity the fixpoint exists to preserve. Without a definition of this value is a live entity rather than plain data, there is nothing for identity to be a property of, and the capture edge has nothing to test.

Three smaller rules complete the domain. A callable is in the domain and is never a value; a project-local function may be called during reduction, but `{ resolver: f }` does not reduce though `f(x)` does, because nothing can serialise a function. Constructor arity is contractual; when the argument list is not a props object optionally followed by attributes, the positional list is authoritative and the entity is built by spreading it. And absence has two forms, since `undefined` in a property position is dropped at emission and in an array position becomes `null`, which follows from the host's JSON semantics and has to be stated because platforms act on the difference.

### 3.2 Three evaluation modes

Reduction reaches a value by three different mechanisms. Conflating them is the easiest way to misread the design, and the second has no counterpart in the first.

Envelope, then revive. This is the common case and the one the figure draws. Reduction records what the source named and executes nothing: a construction becomes a resource envelope, a registered intrinsic an intrinsic envelope, a helper call a helper envelope. A second phase then resolves each name through the folding file's own import declarations, imports that module, and invokes the real constructor with the reduced arguments. This two-phase shape is what makes the no-execution claim precise. What is guaranteed is that none of the reduced file's own statements run. Code does execute during revival, namely the same module the fallback path would have imported, for the same purpose. Claiming nothing executes would be false, and omitting revival would leave the specification unimplementable.

Interpret, without importing. A composite factory is evaluated rather than invoked when three things hold: it is defined in the project's own source, registered in the form the host recognises, and its body stays inside the narrower factory sub-grammar. Its defining module is never imported. The distinction from revival is not a refinement. Revival imports and calls; interpretation reads and evaluates. That is what lets a file reduce under isolation, where invoking project-owned code is refused outright, and it is the mode with no analogue in the envelope path.

Evaluate eagerly. A registered function whose result is coerced to a string during reduction is called at reduction time rather than enveloped, because an envelope deferred to revival would stringify as a placeholder. A method call on a real receiver is the same mode. Both run code the file imported rather than code it wrote, so both stay inside the no-execution guarantee. Their existence is an admission worth keeping: the eager mode is there to serve a coercion, not because eagerness is independently right, and the specification says so.

## 4. What the fold gives a platform

The sections above say what the fold is. A reviewer who grants every property can still ask why anyone would want them, and the answer is three capabilities that neither a syntax linter nor a configuration language provides.

Synthesis with no execution. A file in the subset becomes its artifact by being read. Nothing runs, so the artifact is a function of the source and the build-parameter binding and nothing else, and the same file yields the same artifact on any machine and in any evaluator, whatever language the evaluator is written in. A reviewer reading a diff sees exactly what will ship. The user never meets the fold as a mechanism; they meet it as a lint that says while they type whether the file is data and which line makes it not data. That lint is the shape classifier, and it needs no evaluator to run.

Rules over values. A syntax linter sees tokens and can say a key is misspelt. A configuration language with constraints in the type can say a port is out of range. Neither can say that two fields of one resource contradict each other, or that a resource in one file makes a resource in another incoherent, because neither has the values of every file in the build before anything is emitted. The fold does. A rule over folded values is a pure function of its input, deterministic and free of I/O, and it sees the same data wherever the fold runs. Two phases follow, rules over the declared values before serialisation and rules over the emitted artifact after, and the specification defines the contract they run under rather than any rule: what a check sees and when it runs, what it may do, and what a finding carries. The phase the fold enables is the first. A rule over the artifact needs no fold and every tool that emits YAML can run one. A rule over the declared values sees references still as references and an entity as one entity wherever it is used, with nothing executed, and the contract states as a property that its findings are the same whether the build folded the file or ran it. A finding is data carrying its rule and subject with a path into the value, which is what lets a person or an agent act on it.

Round-trip generation. The fold goes from source to data; a generator goes from data to source. Composed, an existing artifact or a live system becomes source that folds back to exactly what it came from. This is where the choice of a general-purpose language stops being taste and becomes correctness. A generator decides what each value is, and each decision needs a source form the subset can express and the fold can reverse. A literal is a literal. A value that is another resource's attribute is `bucket.Arn`, which the member rule turns back into an attribute reference. A repetition across forty resources is one `const`, spread where it is used, which the object rule folds back to the same forty objects. YAML cannot express the second or the third. A configuration language can, but then the source is no longer the artifact's own shape. The specification states the completeness half as a rule, that every value of the domain has a source form that folds to it, with one form per case, and holds a generator to the fidelity half through a fixture kind whose input is a namespace as data.

The first two need only the profile without a runtime, so they are available to an evaluator in any language. The third needs whichever profile the generator targets. None of the three needs the fallback or the fixpoint; those exist so that source outside the subset can still be built by an implementation that has a runtime, and they are the part of the specification this paper is about. The capabilities are the part a platform adopts.

## 5. Two properties

### 5.1 One instance per entity

Let a build be `B = (F, →, P)`, the finite set of discovered project files together with the import and re-export edges between them and the binding of build parameters. The per-file judgment gives tentative verdicts. The fixpoint gives final ones by computing `T(B)`, the least set containing every file that fails alone and closed under the forward and backward edges. Let `e` be an entity produced by file `g`.

Claim. Exactly one object represents `e` in the build, and every reference to `e` resolves to that object.

Proof sketch. The proof splits on whether `g ∈ T(B)`. If `g ∉ T(B)`, then `g` folded and `e` is the object in its namespace; memoisation makes it unique within the build and the once-per-call-site rule within the file. Take any `f` referring to `e`. A folded `f` captured from `g`, so `g` is a successor of `f`; then `f ∈ T(B)` would put `g ∈ T(B)`, a contradiction, so `f` holds the memoised object. A running `f` imports `g`, so again `g` would be in `T(B)`; so no referrer runs. If `g ∈ T(B)`, then `g` runs and execution constructs `e`. A referrer that imports `g` cannot be outside `T(B)`, so it runs and imports `g` through the host module system, one module instance per file; a referrer that captured from `g` is in `T(B)` by the backward edge, and its folded capture is discarded. In neither case do a folded object and a run object for `e` coexist.

The sketch assumes memoisation and the once-per-call-site rule hold in the implementation, that the run path yields one module instance per file, and that `T(B)` exists and is finite, which the least-fixpoint statement gives. The first prose statement of the forward edge had the direction reversed, and writing the successor relation as an operator is what caught it; we keep that as evidence that the formal statement earns its place.

What has been executed. The reference computes `T(B)` by a worklist from the seed, and whole-build fixtures hold it to each edge in turn: a file that seeds with no edge at all; the forward edge into an import; the backward edge two hops out through a capture; and a control, the file nothing reaches, which must still fold. Falling back on everything satisfies the claim and is what a degraded implementation does, so the control is the assertion with teeth. chant answers the same fixtures, and the two agree on every file's final verdict and its verdict before taint; for each casualty they agree on the file the edge came from and on which rule it was. chant's own differential over every mixed corpus entry and its adversarial build are the evidence from a real corpus rather than a designed one.

### 5.2 The permitted direction of divergence

Let `shape(e, ρ)` be the classifier's verdict on expression `e` with optional registry `ρ`, and `fold(e, Γ, ρ)` the evaluator's.

Claim. For all `e`, `Γ` and `ρ`, if the fold succeeds then the classifier accepts, except in two cases: an operand or branch the fold never evaluates is outside the subset, and the registry is absent while `e` is a call form the registry would admit.

Proof sketch. Both consumers import one classifier, so every syntactic question has one answer by construction. Every remaining disagreement is a resolution the classifier does not perform, and the specification enumerates them as the twelve rows of section 2.3, each a rejection by the fold of something the classifier accepted. The two exceptions are the only sites where the fold accepts something the classifier rejects, one from lazy evaluation and one from a missing registry.

Corollary. Every disagreement outside the two exceptions costs coverage and never correctness. A file the classifier passes and the fold rejects falls back to run, and never produces wrong output.

### 5.3 The round trip

Let `generate` be any function from the value domain to source in the subset. For every value `v` the domain admits, `fold(generate(v)) = v` in the profile without a runtime, and equals the revived value in the full profile. Completeness is a rule of the specification, a table with one source form per case of the domain, each form folding to its value by the rule the table cites; the domain is closed, so the table is exhaustive. Fidelity is an obligation on each generator rather than a rule, that its output is in the subset and folds to its input, and the suite tests it through a fixture kind whose input is a namespace as data. The reference carries the smallest generator that makes the property testable, one form per case with no factoring; the Rust evaluator carries one too, so the four round-trip fixtures run on both.

### 5.4 Mechanisation

Declined for the submission. The venue accepts compelling arguments, exploratory implementations and substantial examples as validation. The first property has the argument above and three executed artifacts: the differential over every corpus entry including the mixed ones, an adversarial build that fires both taint edges on purpose, and a second implementation held to whole-build fixtures. The second has the shared-classifier construction and the enumerated table, with a fixture per row. A mechanised proof would make the claim airtight rather than accepted, and if pursued it belongs beside the specification on its own gate.

## 6. Evaluation

Every number below names the artifact it comes from and the version it was taken at; appendix B collects them. None is a coverage ratio, because coverage is adoption and not mechanism.

### 6.1 The differential

chant builds every corpus entry twice, folded and run, and requires identical errors and byte-identical serialised output. The error half of that was unsound until chant `0.69.1`, because a module that threw during import was cached as evaluated under the test runner, so the second build of a directory in one process reported no error; the loader now remembers an evaluation failure and replays it. Until chant `0.65.0` the differential compared only entries where every file folded, which are the builds in which the fixpoint does nothing.

The twelve mixed entries are the only builds in which `T(B)` is non-empty, and all twelve agree on both errors and bytes.

| Run | Entries | Fully folded | Mixed | Drift |
|---|---|---|---|---|
| first mixed-entry run, chant 0.65.0 | 107 | 95 | 12 | 0 |

The adversarial entry. One corpus entry is nine files, each named for a resolution-time decision point and citing the inventory row that governs it. Four make the fixpoint fire on purpose inside one build, and section 2.6 walked through them. The entry asserts each verdict by name and the differential holds across it. The other five cover the nullish rule and its optional-chain short circuit, identifier shadowing and spread typing, and the depth bound.

### 6.2 The execution boundary

A profiling harness expresses one estate in chant and again in CDK, profiles both synths under the JavaScript engine's CPU profiler, and applies one analyser to both, with timing excluded by design.

| Measurement | chant, folding | `cdk synth` |
|---|---|---|
| project code executed | false | true |
| definition-library code on the path | 0 MB | about 1.7 MB |

The chant side's `false` is also an unsampled invariant: the run fails unless every file reports a fold. A second test asserts over the corpus that under isolation nothing from a project's source directory is imported into the build's process.

### 6.3 The conformance cross-check

The conformance package runs the specification's fixtures against the reference implementation and against chant through its public entry, pinned to a release.

| Pin | Fixtures | Rules with a fixture | Agreement |
|---|---|---|---|
| chant 0.72.3 | 127, of which 65 are whole-build | 135 of 139 | all, on every fixture but the four round-trip ones, which skip at chant for want of a generator |

The four rules without a fixture are properties no adapter can observe from verdicts: provenance, the host's own module tree, and what a host may vary or must not execute. One disagreement existed between the reference and chant, on an envelope inside a template span. The specification recorded the recommendation, chant `0.68.0` implemented it, and a fixture now pins it.

Two profiles. Fixtures carry profile tags, and the reference judged in the profile without a runtime passes every fixture tagged for it. That is a JavaScript implementation passing a profile defined by the absence of JavaScript, so it establishes that the profile is consistent. Whether it is implementable without an engine is what the Rust evaluator establishes. Written from the text on the oxc parser, it passes every fixture tagged for the profile, the four round-trip ones among them since it generates as well as folds, and agrees with the reference on each. Compiled to WebAssembly, with no imports, the same crate passes the same fixtures and agrees with its own binary answer for answer, so the embedded form is the evaluator measured here and not a second one. Over chant's corpus it sits as a third column, both evaluators judged in the same profile on the same host description, and the two agree on all 441 files, with 142 folding on both sides to the same namespace, envelopes included. Writing it found the reference reviving and tainting in a profile that does neither, both fixed.

Coercion, stated as fixtures. Thirteen expression fixtures pin the parts of ECMAScript an evaluator in another language has to reproduce bit for bit. Number formatting in template literals is the largest of them, shortest round-trip digits and the exponent form and negative zero among them. The others are addition's string-or-number dispatch and relational comparison on strings; the logical operators returning an operand; unary coercion with IEEE division; and the one deliberate departure, array spread refusing a string. Both implementations and the Rust evaluator agree on all thirteen.

What this agreement is worth. Until the rewrite, the reference's evaluation layer was a port of chant's, so agreement on expression-level fixtures was guaranteed by construction rather than observed. It is now written from the grammar and the judgments without consulting chant's source, and the comparison is between two codebases rather than one codebase with itself. The port's own failure mode is worth recording. chant `0.69.0` extended an envelope check from three kinds to five while the port still had three, and because no fixture covered the shape, the suite stayed green against a stale port until the drift was found by reading the release diff. Two fixtures now cover it, and the port is gone.

### 6.4 The corpus cross-check

The conformance package also runs chant's example corpus through both implementations and compares verdicts file by file, and export namespaces where both folded. The entries are the ones chant's own differential enumerates, imported rather than re-listed, and the reference is given chant's host assembled from chant's own registries: the lexicon packages' real exports, the helper allowlist and each entry's intrinsic registry.

| Corpus | Files | Comparable | Agreed | Both fold, namespaces identical |
|---|---|---|---|---|
| chant 0.70.1, 108 entries | 409 | 65 | 65 | 50 |
| chant 0.71.0, 109 entries, before the call rule | 441 | 150 | 150 | 118 |
| chant 0.71.0, with the call rule | 441 | 372 | 372 | 258 |
| chant 0.72.1, specification 1.6 | 441 | 440 | 440 | 304 |
| chant 0.72.3, specification 1.8 | 441 | 440 | 440 | 304 |

A file is comparable when nothing disarmed either implementation before the comparison started. Four things did so at the first pin, two at the second, and one remains: the single file that imports a package the reference's host cannot load. Each of the others retired for its own reason. Two were limits of chant's entry point rather than of chant, 52 files reading a host export that could not be resolved without a lexicon list and 19 in entries with build parameters the entry could not be given, until chant `0.71.0` took both. One held 290 files reaching a host factory until the reference implemented the call rule. The last held 68 files calling a package export outside a declarator, and it went when specification `1.6` wrote chant's behaviour into the declarator and call rules.

What this establishes. On 440 files nobody wrote for the purpose, the two implementations agree on every verdict, and on the 304 that fold on both sides the export namespaces are structurally identical, entity class and properties included. The agreement was observed rather than designed; each run has widened the set it is observed on without adding a disagreement.

Its limit. 440 of 441 is the comparable set, and a limit is an over-approximation, so the one file outside it may also be hiding a disagreement. Every run shares a larger limit. chant is the implementation the text was extracted from, so this is agreement with a rewrite written from the text rather than between two independent readings.

Codebases nobody here maintains. Every entry above was written by the people who wrote the folder. Two public projects that depend on chant and are not maintained by us run beside it at a pinned revision, each directory with a configuration file an entry, with the imported project files a build would reach and the host a build would have.

| Checkout | Entries | Files | Comparable | Agreed | Both fold |
|---|---|---|---|---|---|
| a home Kubernetes estate, 16 apps | 16 | 19 | 12 | 12 | 9 |
| an Infisical deployment | 6 | 31 | 13 | 13 | 5 |

The host limit is large there because both were written against an older chant, so a package export the pinned release no longer has disarms every file that imports it. The first run found one disagreement, and it is the kind the row exists to find: a file whose only declarator called a project function that reads the process environment. chant folded it by invoking the function at fold time, and the fold's output carried whatever the folding shell held. The specification routes a declared function to the project-local call rule, whose ambient read is a pointed rejection, so the file runs. chant `0.72.3` does the same, and specification `1.8` made the old behaviour the opt-in mode of section 2.4 rather than a silent default.

What the runs found on the way. The first corpus run, with no host, compared seven files and none folded on either side, which is agreement by vacuity. With a host it turned up a reference bug, a specification defect and a harness artifact: the capture walk stopping at an entity's boundary, a rule that read an instance as pre-built that no rule built, and 21 files on which the harness had asked the two implementations different questions. The second run exposed 79 more files and 10 disagreed, all in the harness or the reference. The third implemented the call rule and exposed 290, and three things fell out, among them a liveness test that was prototype-only where the host's own marker was the rule. The fourth settled the last 68 with a rule written to what chant does and no more, after a first draft that went too far and folded five shapes chant refuses, which the fixture cross-check caught before the corpus could.

### 6.5 What the specification found

Writing the specification against the implementation found defects the implementation's own tests had not.

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
| a declared project function with an unfoldable body was invoked in open mode, and the environment leaked into the fold | found by the external corpus; fixed in chant 0.72.3 and made an opt-in mode in specification 1.8 |

### 6.6 Negative results, kept

chant's coverage history records that its predictions about which change would unblock folding were mostly wrong. The change it had called the single biggest lever moved a single entry of 107, while two later changes moved 21 each. The corpus is chant's own examples and its documentation says the number estimates nothing beyond them; both statements stay.

### 6.7 Limits

Twelve mixed entries and one adversarial build are a small sample from one project, and the external rows add 50 files from two more, both written against an older chant. The four rules without a fixture are the unobservable ones already named. The reference never invokes a project module, so the open mode's invocation of a registered composite that cannot be interpreted, and the `executing` mode, are the two things it reports as unavailable rather than answers.

## 7. Related work

Compile-time function execution. D, Zig, Rust and C++ evaluate a function at compile time when its inputs are static and at run time otherwise. D's specification states the principle this work relies on, that a function's semantics cannot depend on compile-time values, so the calling context alone decides where it runs; the no-substitution rule is the same principle as a rule, since the function revival invokes is the one the file imported. Two differences. CTFE decides per call site where this work decides per file, and a CTFE'd value is copied into the compiled program, so nothing at run time shares identity with a compile-time object. Here a folded entity is the object other files hold references to, which is why the fixpoint exists. D also treats an unevaluable required context as an error, where this work requires a fallback.

Separate partial evaluation. Heldal and Hughes treat a program as modules that can be specialised independently. The problems posed concern the structure of specialisation, a program arriving one module at a time, or static data split into data modules with one residual module each. Neither is a per-module choice between specialising and not, and the setting is a functional language without object identity. This reading is from the published abstracts; the full text was not obtainable and is a citation to confirm.

Partial evaluation and binding-time analysis. The shape classifier is a binding-time analysis and the fold is the specialiser, in the sense of Jones, Gomard and Sestoft; the static and dynamic split is theirs. The per-file verdict with taint is closer to an online decision over a coarse unit than to an offline analysis, and forcing a folded file back to run is a coarse form of the lift operation. Multi-stage programming makes staging explicit in the language instead of inferring it.

Partial evaluation of JavaScript. Prepack evaluates a bundle's global code, captures the heap, and emits a residual program that rebuilds it. Code it cannot evaluate is residualised through abstract values; there is no per-unit fallback and always one program. Its residual-heap visitor keeps a scope-indexed visited set so a shared object is emitted once, which is identity within one heap, the case a per-file split gives up.

Per-unit static or executed. Next.js decides per page whether to prerender or render on request, from the presence of a data-fetching export, and Astro's hybrid mode is the same shape. The decision is a syntactic marker the author writes rather than an analysis of evaluability; prerendered and served pages share no runtime objects, and no agreement obligation is stated.

Evaluation that escapes into execution. Nix's import-from-derivation pauses evaluation, realises a store object, and resumes with its contents. The escape is into a sandboxed, content-addressed build, which keeps the result deterministic. This is the precedent for the isolated mode and not for folding.

Total configuration languages.

| Language | Recursion | Side effects | Out-of-subset source |
|---|---|---|---|
| Starlark | no | no | error |
| Dhall | no | no | error |
| CUE | no general recursion or functions | no | error |
| Jsonnet | yes, lazy | no | error |
| Nickel | yes | constrained to commutative | error |
| Pkl | yes | no | error |

Every row answers unsupported source with an error and so has no two-path agreement problem and no identity problem. This work's fallback is what removes that simplification. Pkl and CUE deserve one more sentence each, because a reader will have them open. Both give a platform typed, deterministic configuration that emits YAML or JSON, and Pkl puts value constraints in the type where this work puts them in a separate pass over folded values. What neither gives is the authoring surface being the artifact's own shape: a Pkl or CUE file is a second grammar pointed at the spec, where a typed object literal is the spec with its keys unquoted. Pkl's bindings for other languages shell out to an evaluator binary; the profile without a runtime is what lets an evaluator for this subset be a library in the platform's own language, or a WebAssembly module inside it.

Infrastructure tools. CDK, Pulumi and Alchemy execute the program that builds the resource graph, and the graph exists only as the output of a run. Terraform evaluates HCL with functions against state. Formae compiles Pkl to data.

What is claimed as new. Per-file partial evaluation with a fallback is precedented in shape and in principle. Same-function agreement through revival is CTFE's design principle. Byte-identical agreement as a tested property over a corpus was not found stated elsewhere. What we claim is the pairing of per-file granularity with identity shared across the boundary, made sound by a taint fixpoint that runs both ways; a precedent for that pairing was not found.

## 8. Discussion

What the design costs. Section 2.5 named two costs, the leaf fix that buys nothing and the verdict that is not the file's own, and both were observed before they were understood. A third cost is that coverage is not the security-relevant number. A file that folds executes none of its own code either way, so partial coverage does nothing for the files that matter; isolating the fallback is what bounds the remainder, and it changes what folds, which is why the specification carries isolation as a mode of the verdict rather than as a deployment detail.

What is unresolved. Three places where the implementation settled a question by accident rather than decision, each recorded in the specification rather than smoothed over. The classifier is flow-insensitive, so `false && f()` is a lint error on code that folds cleanly, and making it flow-sensitive means writing an evaluator inside a lint rule. One member name, `.step`, is admitted after a call because one idiom uses it, and there is no principled boundary that admits it and excludes the next member somebody needs. And one class of registered call is evaluated at fold time rather than enveloped, because its usual use coerces the result to a string. A specification that presented these as designed would be easier to read and less true.

What would falsify the identity property. A single fold-run disagreement on a mixed build; the differential requires identical errors and bytes for every entry, and one disagreement there is either a bug in the fixpoint or a gap in the argument. An entity reachable by two paths with different verdicts; the case analysis rules this out given memoisation and the once-per-call-site rule, and two implementation choices would produce it anyway, memoising per referrer or invoking a composite once per member access, neither of which the corpus would necessarily catch. And a sharing relationship the capture set does not record; a third route into another file's objects that neither the import edge nor the call edge records would make the fixpoint incomplete, and nothing currently searches for one.

What changed the claims while this draft was written. Two things this section once asked for now exist, and each moved a number. An evaluator with no JavaScript engine tests the coercion fixtures in a way a JavaScript implementation cannot, and it agrees. A corpus nobody here maintains found, on its first run, a case where the production implementation executed project code that the specification says to refuse. That is the argument for both, and it is why the remaining ask is a larger one: source written against the specification by someone who has not read the implementation, in volume.

## 9. Conclusion

The subset is not the contribution; carving one is routine, and six languages have done it more completely. The contribution is the edge, where a file folds entirely or runs entirely, the two paths agree at a fixed binding, and identity survives because a fixpoint over the module graph refuses to let a folded object and a run object stand for one entity. That fixpoint has no precedent we could find. The evidence for it is a specification with named rules and a reference written from the text, beside a second evaluator in another language for the half that transfers, with the reference and a production system agreeing on every comparable file of 441.

## Appendix A. Rule identifiers used in this paper

| Identifier | What it states |
|---|---|
| `F-Total` | a file folds entirely or runs entirely; no partial namespace |
| `F-Div-*` | the twelve enumerated divergences of section 2.3, each a resolution the classifier does not perform |
| `F-Seed`, `F-Succ`, `F-Taint`, `F-Fix` | the fixpoint: its seed, its two edges, its closure and its least-fixpoint form |
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

---

*A note for readers of this draft.* This is the extended draft, about twice the length the venue allows, and it is circulated for comment before it is cut. Three questions would help most. Is the identity property and its fixpoint, section 2.5 and `5.1`, stated so that its necessity is clear to someone who has not built such a system? Does the two-profile split of section 2.8 make the portable half of the work legible, or does it read as a hedge? And which of section 6's measurements would you want to see before believing section 7's claim of novelty?
