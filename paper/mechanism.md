# The mechanism

Draft for #53. Every claim names the rule that states it; `spec/` is the long form and this is a guide to it.

## Two layers of admissibility

A file is admitted in two stages, and the first is easy to miss because it is not about expressions at all.

The **statement gate** (`S-Module`) examines only exported statements, and recognises six shapes.

| Shape | Example |
|---|---|
| a construction bound to a `const` | `export const b = new Bucket({…})` |
| any other `const` initializer | `export const web = Stack({…})` |
| a destructured export | `export const { a, b } = Stack({…})` |
| a local export list | `export { a, b }` |
| a re-export | `export { a } from "./m"` |
| an exported function | `export function f() {…}` |

Anything else disqualifies the whole file, `S-Disqualify` listing the cases. Non-exported statements are invisible to the gate. They are neither admitted nor disqualifying, and they never execute.

The gate is per module rather than per declaration, and the reason is worth stating: an unfoldable export can reference or be referenced by a foldable one in ways only running proves safe (`F-Total`).

The **expression classifier** (`grammar.md` §2) then decides the shapes inside an admitted statement. It resolves nothing. That is deliberate, and it is the subject of the direction claim below.

## Three evaluation modes

Reducing an expression to a value uses three different mechanisms, and conflating them is the easiest way to misread the design.

**Envelope, then revive.** The common case. Evaluation produces a symbolic envelope naming what the source named: `{__resource}` for a construction, `{__intrinsic}` for a registered intrinsic, `{__helper}` for an authoring helper, `{__compositeStep}` for the `.step` idiom (`F-Val-Domain`). Nothing executes. A second phase then resolves each name **through the folding file's own imports** and invokes the real constructor or function (`F-Val-Fate`). The value the caller receives is the one the run path would have produced, from the same module the source itself imported.

That two-phase shape is what makes the no-execution claim precise. What is guaranteed is that none of the folded file's own statements run (`F-NoOwnExecution`). Revival does run code — the same code the run path would import for the same purpose. Stating the claim as "nothing executes" would be false; omitting revival would make the specification unimplementable.

**Interpret, without importing.** A composite factory defined in the project's own source, registered in a form the host recognises, and whose body stays inside a narrower statement subset, is *evaluated* rather than invoked (`F-Call` step 4, `F-Host-Composite`). Its defining module is never imported. This is the mode that lets a file fold under isolation at all, and it has no counterpart in the envelope path.

**Evaluate eagerly.** A registered function whose result is coerced to a string during folding is called at fold time rather than enveloped, because an envelope deferred to revival would stringify as a placeholder (`F-Eval-CallEager`). A method call on a real receiver is the same mode (`F-Eval-CallMethod`). Both run code the file imported rather than code it wrote.

## One classifier, two consumers, one permitted direction

The subset has a single definition with two consumers. A lint pass reads it without a binding resolver or a registry; an evaluator reads it with both. They will disagree, and the specification's job is to constrain how.

**If evaluation succeeds, classification accepts** (`F-Direction`), with two named exceptions. The classifier is flow-insensitive, so it requires every branch of a short-circuiting operator to be valid where the evaluator folds only the taken one (`F-Exc-Lazy`). And it takes the intrinsic registry as an optional parameter: without one, a call form the registry would admit is refused (`F-Exc-Registry`).

Twelve enumerated divergences run the permitted way (`F-Div-*`). They cover what only resolution can decide: whether a name resolves, whether a tag is registered, whether a helper came from the host, what a spread source turns out to be. Each costs coverage rather than correctness, because a file the classifier passes and the evaluator refuses falls back to run.

## The per-file verdict

Evaluation of a single file yields `fold` with a complete export namespace, or `run` with a located reason (`F-Total`, `F-Reason`). The result is all or nothing, because one unrecognised export disqualifies the file. A fallback is a normal outcome, not an error, which is why it must be reported — an unreported fallback is indistinguishable from a fold, and the no-execution guarantee becomes unauditable (`F-Obs-Report`).

The verdict is parameterised by isolation. Under an isolated mode, a fold that would have to invoke project-owned code falls back instead (`F-IsolatedRefusal`), so the decision is not a pure function of the source.

This verdict is a proposal. What makes it final is the fixpoint.

## Identity across the boundary

Per-file partial evaluation is unsound when values have identity, and this is the part with no precedent we could find.

Suppose file `A` folds and file `B` runs, and both refer to an entity that `A` produced. `B`'s real import of `A` constructs a second copy, and the build holds two objects for one entity: their attribute references cannot both receive a logical name, and a reference to one silently inlines instead of referring. Every comparable system avoids this by not having it. Compile-time function execution copies values across its boundary; per-page static rendering shares no runtime objects; a whole-program partial evaluator has one heap.

The fixpoint (`F-Taint`) closes the tentative verdicts under two edges:

- **forward**, along imports: a running file taints what it imports, because its real import would construct what a folded copy already holds (`F-Succ`);
- **backward**, along captures: a file whose objects were captured taints the capturer, because the instance the capturer holds is no longer the one the build collects (`F-Succ`, `F-Capture`).

A third edge runs through calls rather than imports: a project-local function whose call returns a live object the body produced records the same capture (`F-CallLeak`). Invocation propagates identity the same way import does.

Seeded with every file that would not fold alone, closed under both edges, least fixpoint over a finite set, so it terminates (`F-Fix`). Two supporting rules make it meaningful: each file is evaluated at most once per build (`F-Memo`), and within a file a call reached through several member accesses is invoked exactly once (`F-Count`). Without those, a capture would record an edge to a copy.

The property this buys is stated and argued in `theorem.md`: exactly one object represents each entity, and every reference resolves to it.

Two consequences are worth stating because they look like defects:

- A leaf fix buys nothing while an importer still runs. This was observed as falling coverage before it was understood, and it is the soundness condition rather than a bug.
- A folded file can be forced to run by a file it never imports, through the backward edge. Nothing in its own source predicts that, which is why the fallback reason has to be able to say so.

## What a host supplies

The subset is parameterised. A host provides six things (`F-Host-Interface`). Two concern entities: the constructors that build them and how they expose attributes. Three are lists the host installs: an intrinsic registry, an authoring-helper allowlist, and a trust set. The sixth is the form a composite registration takes. A registered call is admitted only if it is a pure function of its arguments and invoking it at fold time is indistinguishable from invoking it during a real run (`F-Host-Admission`), and revival always invokes the function the file imported rather than a reimplementation (`F-Host-NoSubstitution`).

Calls into a package fold only through a closed allowlist checked by name and import provenance; calls into the project's own files fold whenever the callee's body is itself in the subset. The asymmetry is the trust boundary: package code is already loaded and executed by the build, while project code is the untrusted input and is admitted only when it can be evaluated without being executed.

The generality this buys is over host vocabularies, not over languages. The syntax is TypeScript's and the operator semantics are ECMAScript's, with two deliberate departures the specification names (`R10.2`, `R10.6` in `grammar.md`'s rationale).
