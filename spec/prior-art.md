# Prior art

Not normative. A survey of the neighboring systems and where each one is
nearest.

## Summary

Graceful fallback from static evaluation to execution is well established.
Two families do it, and one of them, compile-time function execution, makes
the same argument this work makes: the same function runs in either context,
so the result cannot differ.

No neighbor combines per-file granularity with shared object identity across
the boundary. That combination is what forces the bidirectional taint
fixpoint, and the fixpoint is where this sweep found no precedent.

## Nearest neighbors, by the dimension they are nearest on

### Same function, static or dynamic, same result, the CTFE family

D's compile-time function execution, Zig's `comptime`, Rust's `const fn`,
C++'s `constexpr`. The D specification states the principle directly, quoted in the next
paragraph: the same code runs in both contexts, and the context alone decides. That is chant's revival argument, "the function that runs
is the one your `import` names", made twenty years earlier in a general-purpose
language.

CTFE decides per *call site*. The specification (dlang/dmd,
`spec/function.dd`, "Compile Time Function Execution") lists the contexts
"where a compile time value is required" and states the principle this work
relies on: "All functions that execute in CTFE must also be executable at run
time. The compile time evaluation of a function does the equivalent of running
the function at run time. The semantics of a function cannot depend on compile
time values of the function."

A required context that cannot be evaluated is illegal, and there is no
fallback. The spec's own example "is illegal, because the runtime code for
`foo` cannot be generated", and DMD reports "cannot be interpreted at compile
time". `__ctfe` exists to give "an alternative execution path to avoid
operations which are forbidden in CTFE". chant decides per *file*, and a file
that cannot be folded is run.

A CTFE'd value is *copied* into the compiled program, so nothing at run time
shares identity with a compile-time object. chant's folded entities are the
same objects the run path would have built, and other files hold references to
them. That is the whole reason the taint fixpoint exists, and CTFE has no
analogue because it has no such sharing.

### Per-unit static-versus-execute decision (Next.js, Astro)

Next.js "automatic static optimization" decides per page: absent
`getServerSideProps`/`getInitialProps`, the page is prerendered to static HTML;
present, it is rendered per request. Astro's hybrid mode is the same shape. The
decision is per unit, the fallback is execution, and a hybrid application
mixes both.

There, the decision is by a *syntactic marker the author
writes*, and an analysis of whether the unit is statically evaluable plays no
part; and
statically-rendered and server-rendered pages share no runtime object identity
across the boundary, so there is nothing to taint. The equivalence obligation
is also never stated as a discharged property.

### Partial evaluation of JavaScript (Prepack)

Facebook's Prepack evaluates a JavaScript program's global code at build time,
captures the resulting heap, and emits a residual program that reconstructs it.
Code it cannot evaluate is *residualized*, emitted as code that runs later -
tracked through abstract values. There is no per-unit fallback to the original; the output is always one
residual program.

Residualization is finer-grained than per-file fallback
and keeps identity trivially, because the residual program is one program with
one heap. chant's choice of a coarse per-file decision is what makes identity
non-trivial. Prepack's own limitation is instructive for the paper: it has no
model of `document` or `window` and such reads "evaluate to `undefined`", the
same silent-undefined hazard INTENTIUS/chant#2328 records in `fold()`'s
property-access branch.

On the identity question specifically: Prepack's `ResidualHeapVisitor`
keeps a scope-indexed visited map (`values: Map<Value, Set<Scope>>`) and skips
re-visiting a value already seen in a scope, so an object reachable from two
places is emitted once and both references are linked to it. That is identity
preservation *within one residual heap*, the easy case, and the one chant's
per-file split forgoes. It is the right citation for "the JavaScript precedent
handled sharing by never splitting the heap".

Prepack was archived by its owner on 2022-02-12 and the team's last word was
that work had been "temporarily set down". The related academic line is SPEjs
(symbolic partial evaluation for JavaScript).

### Modular partial evaluation (Heldal & Hughes)

"Partial evaluation and separate compilation" (PEPM 1997) and its extension
"Extending a partial evaluator which supports separate compilation"
(*Theoretical Computer Science* 248, 2000). Their framing was that all prior partial
evaluators processed a complete program to produce a complete residual program;
they treat a program as a collection of modules processed independently.

This is the closest theoretical neighbor to per-file folding and the paper
must engage it directly.

**Read at abstract level.** ACM DL and ScienceDirect both refuse
the fetcher (403), including ScienceDirect's bronze-open-access PDF that
Unpaywall reports for the TCS version. Hughes' Chalmers page links a
PostScript copy marked "provided only to the TFR reviewers"; it was not
fetched. What is established from the published
abstract and from the Chalmers group's own summary of the work
(`cse.chalmers.se/~rjmh/TFR/results.html`): they pose **two** problems -
the program to be specialized arrives one module at a time (PLDI '97), or the
*static data* is divided into "data modules" and the residual program is built
in stages, one residual module per data module (PEPM '97, extended in TCS
2000). Both are about the modular *structure* of specialization: how the
input's modules map onto the residual's modules while the whole program is
specialized. As posed, neither is a per-module *choice* to specialize or not. The setting is a functional language where
object identity is not a concept, so the identity problem chant's fixpoint
solves has no obvious way to arise there.

Not a rediscovery, then. Heldal & Hughes is the citation for "partial
evaluation has been made modular before", and chant's contribution is
orthogonal to it: a per-module fall-back with identity preserved across the
resulting boundary. Confidence is moderate, resting on the abstract and the
authors' own précis rather than the body of the paper.

### Evaluation that escapes into execution (Nix import-from-derivation)

Nix evaluation is pure. IFD pauses it to realise a store object (a build), then
resumes with the contents. The community's own framing is that
IFD "is bind" for Nix builds. It is an escape from pure evaluation that keeps
the result deterministic because the build is sandboxed and content-addressed.

IFD escapes into a *build* of something else; chant's
fallback executes *the source file itself*. IFD is the better precedent for
`--sandbox` than for folding, and belongs in the isolation discussion.

### Total configuration languages, the original comparison set

| Language | Recursion | Side effects | Types |
|---|---|---|---|
| Starlark | no | no | dynamic; not Turing-complete |
| Dhall | no | no | static |
| CUE | no general recursion or functions | no | static |
| Jsonnet | yes, lazy | no | dynamic |
| Nickel | yes, Turing-complete | yes, constrained to commutative | gradual, with contracts |

None has a fallback to executing out-of-subset source; all reject it. The
plan's comparison was right about these and wrong to generalize from them to
"every comparable system".

### Theory to cite

Offline partial evaluation with binding-time analysis (Jones, Gomard &
Sestoft) remains the right frame: the shape classifier is a BTA, `fold()` is
the specializer. Two refinements the sweep suggests:

1. chant's per-file decision with taint is closer to an *online* decision over
   a coarse unit than to a classical offline BTA.
2. The "lift" operation, a static value flowing into a dynamic context, is the
   fine-grained version of what forcing a folded file back to run does
   coarsely.

Multi-stage programming (Taha & Sheard) is the neighbor where staging is
explicit in the language rather than inferred.

## Where the precedent stands

1. Per-file partial evaluation with a fallback to executing the unit.
   Precedented in shape by Next.js and in principle by CTFE.
2. Same-function agreement via revival through the file's own imports.
   Precedented by CTFE's design principle, and citable as the same argument.
3. Byte-identical agreement as a discharged obligation over a real corpus.
   Not found in this sweep as a stated, tested property, and not searched for
   specifically. A methodological contribution.
4. Bidirectional identity taint over the module graph, so that a shared entity
   is never two objects when one side folds and the other runs. No precedent
   found. It follows from per-file granularity with shared identity, the one
   combination none of the neighbors has.

## Open

Heldal & Hughes 2000 has been read only at abstract level, from the published
abstract and the Chalmers group's own summary. Item 4 does not turn on it, and
a camera-ready citation should rest on the full text. ACM DL and ScienceDirect
both paywall it, so the full text needs institutional or purchased access.
