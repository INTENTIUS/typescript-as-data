# Values and evaluation modes

Draft for #58, split out of the mechanism section. What reduction produces, and the three different ways it produces it.

## The value domain

Reduction yields a value from a closed domain (`F-Val-Domain`). Six cases are ordinary JSON, from scalars through arrays to plain objects. The other six are **envelopes**, non-array objects carrying one marker key, each denoting something the build has not yet constructed (`F-Val-Envelope`).

| Envelope | Denotes | Fate under revival |
|---|---|---|
| `__attrRef` | an attribute of another entity, resolved by the platform at apply | survives to serialisation |
| `__intrinsic` | a registered intrinsic, in tagged-template or call form | revived |
| `__helper` | a call to a registered authoring helper | revived |
| `__resource` | a construction, at a file's top level or nested as a value | revived |
| `__compositeStep` | a composite call narrowed to `.step` | revived |
| `__symbol` | source text preserved inside an intrinsic's interior | revived |

![Reduce to envelopes, then revive](figures/two-phase.svg)

### An envelope is a finished value

An `__attrRef` is not a thunk. It is the same shape the runtime object serialises to, and the serialiser accepts it without a live instance. Describing envelopes as *unevaluated* invites an implementation that tries to force them, which is exactly wrong: the value they denote does not exist at build time on either path, and will not until the platform resolves it (`F-Val-Envelope`).

### Exactly one survives

Revival replaces five of the six, resolving each name through the folding file's own imports and invoking the real function or constructor (`F-Val-Fate`). Only `__attrRef` reaches a serialiser. An implementation that emitted a `__resource` envelope has produced wrong output rather than a placeholder, and a differential across a real corpus caught precisely that before the rule was written down.

### Validity is position-dependent

Inside the arguments of an intrinsic or an authoring helper, an `__attrRef` is refused rather than passed (`F-Val-Position`). The receiving function inspects what it is given, checking types and dereferencing weak references, and a look-alike plain object makes it produce wrong output rather than absent output. One position out, in a construction's props, the same value passes untouched, because there the serialiser resolves it by name.

The same value is therefore valid in one position and a rejection in another. A definition of the domain alone does not capture that, so the rule is part of the domain rather than a note about it.

### Liveness, and why it matters

A value *carries a live object* when it, or anything reachable through plain objects and arrays, has a prototype other than the plain ones, or is a function (`F-Val-Live`). Live objects reached through cross-file resolution pass through revival untouched, because the generic walk would rebuild them as plain copies and destroy the identity the fixpoint exists to preserve.

This predicate is what makes the identity rules statable at all. Without a definition of *this value is a live entity rather than plain data*, there is nothing for identity to be a property of, and the capture edge of the fixpoint has nothing to test.

### Callables, arity, and absence

Three smaller rules complete the domain.

A **callable** is in the domain and is never a value. A project-local function may be called during reduction, but `{ resolver: f }` does not reduce though `f(x)` does, because nothing can serialise a function (`F-Val-Callable`).

**Constructor arity is contractual.** The common shape is a props object, optionally followed by resource-level attributes. When the argument list is neither, the positional argument list is authoritative and the entity is built by spreading it (`F-Val-Arity`). An implementation that assumed the props object comes first would construct a real lexicon's parameter type wrongly.

**Absence has two forms.** `undefined` in a property position is dropped at emission; in an array position it becomes `null` (R10.7). Both follow from the host's JSON semantics and both must be stated, because platforms act on the difference between an absent field and a null one.

## Three evaluation modes

Reduction reaches a value by three different mechanisms. Conflating them is the easiest way to misread the design, and the second has no counterpart in the first.

### Envelope, then revive

The common case, and the one the figure above draws. Reduction records what the source named and executes nothing: a construction becomes `{__resource}`, a registered intrinsic `{__intrinsic}`, a helper call `{__helper}`. A second phase then resolves each name **through the folding file's own import declarations**, imports that module, and invokes the real constructor with the reduced arguments.

```
source        export const b = new Bucket({ name: "logs" })
reduce        { __resource: "Bucket", props: { name: "logs" } }
revive        resolve Bucket through this file's imports, then new Bucket({ name: "logs" })
```

This two-phase shape is what makes the no-execution claim precise. What is guaranteed is that none of the reduced file's own statements run (`F-NoOwnExecution`). Code does execute during revival, namely the same module the fallback path would have imported, for the same purpose. Claiming nothing executes would be false, and omitting revival would leave the specification unimplementable.

### Interpret, without importing

A composite factory is *evaluated* rather than invoked when three things hold (`F-Call` step 4, `F-Host-Composite`): it is defined in the project's own source, registered in the form the host recognises, and its body stays inside the narrower factory sub-grammar. Its defining module is never imported at all.

```
source        export const web = WebApp({ tier: "prod" })
interpret     evaluate WebApp's body against ITS module's scope,
              building members with the lexicon's own constructors
```

The distinction from revival is not a refinement. Revival imports and calls; interpretation reads and evaluates. That is what lets a file reduce under isolation, where invoking project-owned code is refused outright, and it is the mode with no analogue in the envelope path.

### Evaluate eagerly

A registered function whose result is coerced to a string during reduction is called at reduction time rather than enveloped (`F-Eval-CallEager`), because an envelope deferred to revival would stringify as a placeholder. A method call on a real receiver is the same mode (`F-Eval-CallMethod`).

```
source        `${matrix("os")}`
eager         call matrix now, because the template coerces its result
              before any revival would run
```

Both run code the file imported rather than code it wrote, so both stay inside `F-NoOwnExecution`. Their existence is an admission worth keeping: the eager mode is there to serve a coercion, not because eagerness is independently right, and the specification says so.
