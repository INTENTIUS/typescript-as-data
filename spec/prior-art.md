# Prior art: does the novelty claim stand?

Finding for #31, written 2026-09-09. Not normative.

## The claim as the plan stated it

> Every comparable system answers out-of-subset source with a syntax error;
> this one falls back to real execution per file, provably produces the same
> bytes, and draws the boundary so object identity survives crossing it. The
> fallback is the contribution.

## Verdict

**The claim does not stand as stated. It stands in a narrowed form.**

"Everyone else errors" is false. Two well-established families fall back
gracefully from static evaluation to execution, and one of them, compile-time
function execution, makes exactly chant's argument that the same function runs
in either context so the result cannot differ. What none of the neighbours has
is the combination of per-file granularity with shared object identity across
the boundary, which is what forces the bidirectional taint fixpoint. That
fixpoint is the part with no visible precedent, and it should be the paper's
centre rather than "the fallback".

## Nearest neighbours, by the dimension they are nearest on

### Same function, static or dynamic, same result, the CTFE family

D's compile-time function execution, Zig's `comptime`, Rust's `const fn`,
C++'s `constexpr`. The D specification states the principle directly: a
function's semantics cannot depend on compile-time values; the calling context
alone decides whether it runs at compile time or run time, and the same code is
shared between both. That is chant's revival argument, "the function that runs
is the one your `import` names", made twenty years earlier in a general-purpose
language.

CTFE decides per *call site*, and a context that
*requires* compile-time evaluation and cannot get it is a **compile error**,
not a fallback. DMD's diagnostic is "cannot be interpreted at compile time";
a dlang forum thread (`kaejjbgiujdnqlmyzlup`) shows a `static foreach` over a
function with no available source failing the build on it.
The specification's prose on this was not retrievable in this sweep (the
rendered page and the raw `.dd` both truncated or 404'd), so the citation is
to the compiler's behaviour rather than the spec's sentence; #47 keeps that
open. chant decides per *file*, and a file that cannot be folded is run. A CTFE'd
value is *copied* into the compiled program; nothing at run time shares
identity with a compile-time object. chant's folded entities are the same
objects the run path would have built, and other files hold references to them.
That is the whole reason the taint fixpoint exists, and CTFE has no analogue
because it has no such sharing.

### Per-unit static-versus-execute decision (Next.js, Astro)

Next.js "automatic static optimization" decides per page: absent
`getServerSideProps`/`getInitialProps`, the page is prerendered to static HTML;
present, it is rendered per request. Astro's hybrid mode is the same shape. The
decision is per unit, the fallback is execution, and a hybrid application
mixes both.

There, the decision is by a *syntactic marker the author
writes*, not by an analysis of whether the unit is statically evaluable; and
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

This is the closest theoretical neighbour to per-file folding and the paper
must engage it directly.

**Read at abstract level, not full text.** ACM DL and ScienceDirect both refuse
the fetcher (403), including ScienceDirect's bronze-open-access PDF that
Unpaywall reports for the TCS version. What is established from the published
abstract and from the Chalmers group's own summary of the work
(`cse.chalmers.se/~rjmh/TFR/results.html`): they pose **two** problems -
the program to be specialised arrives one module at a time (PLDI '97), or the
*static data* is divided into "data modules" and the residual program is built
in stages, one residual module per data module (PEPM '97, extended in TCS
2000). Both are about the modular *structure* of specialisation: how the
input's modules map onto the residual's modules while the whole program is
specialised. Neither, as posed, is a per-module *decision* between specialising and
leaving a module unspecialised. The setting is a functional language where
object identity is not a concept, so the identity problem chant's fixpoint
solves has no obvious way to arise there.

So the working conclusion is: **not a rediscovery.** Heldal & Hughes is the
citation for "partial evaluation has been made modular before"; chant's
contribution is orthogonal to it, a per-module fall-back with identity
preserved across the resulting boundary. Confidence is moderate, resting on
the abstract and the authors' own précis rather than the body of the paper.
The full text should still be read before camera-ready (#47), but this is no
longer the unknown that gates #15 and #28.

### Evaluation that escapes into execution (Nix import-from-derivation)

Nix evaluation is pure. IFD pauses it, realises a store object (a build), and
resumes with the contents, the community's own framing is that
IFD "is bind" for Nix builds. It is an escape from pure evaluation that keeps
the result deterministic because the build is sandboxed and content-addressed.

IFD escapes into a *build* of something else; chant's
fallback executes *the source file itself*. IFD is the better precedent for
`--sandbox` than for folding, and belongs in the isolation discussion (#36).

### Total configuration languages, the original comparison set

| Language | Recursion | Side effects | Types |
|---|---|---|---|
| Starlark | no | no | dynamic; not Turing-complete |
| Dhall | no | no | static |
| CUE | no general recursion or functions | no | static |
| Jsonnet | yes, lazy | no | dynamic |
| Nickel | yes, Turing-complete | yes, constrained to commutative | gradual, with contracts |

Nickel's row corrects the plan's earlier framing, which listed it as total.

None has a fallback to executing out-of-subset source; all reject it. The
plan's comparison was right about these and wrong to generalise from them to
"every comparable system".

### Theory to cite

Offline partial evaluation with binding-time analysis (Jones, Gomard &
Sestoft) remains the right frame: the shape classifier is a BTA, `fold()` is
the specializer. Two refinements the sweep suggests: (1) chant's per-file
decision with taint is closer to an *online* decision over a coarse unit than
to a classical offline BTA, and the paper should say which it is; (2) the
"lift" operation, a static value flowing into a dynamic context, is the
fine-grained version of what forcing a folded file back to run does coarsely.
Multi-stage programming (Taha & Sheard) is the neighbour where staging is
explicit in the language rather than inferred.

## What survives, precisely

1. **Per-file partial evaluation with a fallback to executing the unit.**
   Precedented in shape (Next.js) and in principle (CTFE). Not novel alone.
2. **Same-function agreement via revival through the file's own imports.**
   Precedented by CTFE's design principle. Not novel alone; worth citing as
   the same argument.
3. **Byte-identical agreement as a discharged obligation over a real corpus.**
   Not found in this sweep as a stated, tested property; not searched for
   specifically. A methodological contribution, not a conceptual one.
4. **Bidirectional identity taint over the module graph, so that a shared
   entity is never two objects when one side folds and the other runs.** No
   precedent found. This is the contribution, and it exists *because* chant
   chose per-file granularity while keeping shared identity, the one
   combination none of the neighbours has.

## What this changes in the plan

| Issue | Change |
|---|---|
| #5, #27 | Lead related work with CTFE and Heldal & Hughes, not with the configuration languages. Retire the "every comparable system errors" sentence. |
| #15 | The identity-taint fixpoint is the paper's technical centre. Write its spec issue knowing that. |
| #36 | Cite Nix IFD as the precedent for evaluation escaping into a sandboxed execution. |
| #28 | The theorem to state is about identity across the boundary, not about the fallback existing. |

## Must do before submission

1. Read Heldal & Hughes 2000 in full, now for the camera-ready citation
   rather than to decide item 4; see the narrowed conclusion above. Needs a
   browser or institutional access; the fetcher used here is refused.
2. ~~Prepack heap-serialization identity~~, answered above from
   `ResidualHeapVisitor`; a citation to the source file, not the marketing page.
3. ~~D: error versus fallback~~, answered above from the compiler's
   diagnostic. The specification's own sentence is still wanted, for the paper's
   citation. Not blocking.
