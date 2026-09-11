# Related work

Draft for #27. Rule identifiers refer to `spec/`. The order follows #31: the nearest neighbours first, the configuration languages last.

## Compile-time function execution

D, Zig, Rust and C++ evaluate a function at compile time when its inputs are static and at run time otherwise. D's specification states the principle this work relies on: a function's semantics cannot depend on compile-time values, so the calling context alone decides where it runs. `F-Host-NoSubstitution` is the same principle as a rule. The function revival invokes is the one the file imported, never a reimplementation.

Two differences. CTFE decides per call site; this work decides per file (`F-Total`). A CTFE'd value is copied into the compiled program, so nothing at run time shares identity with a compile-time object. Here a folded entity is the object other files hold references to, which is why J3 exists. The D compiler also treats an unevaluable required context as an error; `F-Depth` and `F-Total` require a fallback.

## Separate partial evaluation

Heldal and Hughes treat a program as modules that can be specialised independently (PEPM 1997; TCS 248, 2000). Two problems are posed. The program arrives one module at a time, or the static data is split into data modules with one residual module each. Both concern the structure of specialisation. Neither is a per-module choice between specialising and not, and the setting is a functional language without object identity. `prior-art.md` records the reading as abstract-level; the full text is #47.

## Partial evaluation and binding-time analysis

The shape classifier of `grammar.md` is a binding-time analysis and `fold` is the specialiser, in the sense of Jones, Gomard and Sestoft. The static and dynamic split is theirs. The per-file verdict with taint (J2, J3) is closer to an online decision over a coarse unit than to an offline BTA, and the paper should say which it is. Forcing a folded file back to run is a coarse form of the lift operation. Multi-stage programming makes staging explicit in the language instead of inferring it (Taha and Sheard, MetaML).

## Partial evaluation of JavaScript

Prepack evaluates a bundle's global code, captures the heap, and emits a residual program that rebuilds it. Code it cannot evaluate is residualised through abstract values; there is no per-unit fallback and always one program. Its `ResidualHeapVisitor` keeps a scope-indexed visited set so a shared object is emitted once. That is identity within one heap, the case a per-file split gives up. Prepack was archived in 2022. SPEjs is the academic line.

## Per-unit static or executed

Next.js decides per page whether to prerender or render on request, from the presence of a data-fetching export. Astro's hybrid mode is the same shape. The decision is a syntactic marker the author writes, not an analysis of evaluability, and prerendered and served pages share no runtime objects. No agreement obligation is stated.

## Evaluation that escapes into execution

Nix import-from-derivation pauses evaluation, realises a store object, and resumes with its contents. The escape is into a sandboxed, content-addressed build, which keeps the result deterministic. This is the precedent for `F-IsolatedRefusal` and the isolation mode of J2, not for folding.

## Total configuration languages

| Language | Recursion | Side effects | Out-of-subset source |
|---|---|---|---|
| Starlark | no | no | error |
| Dhall | no | no | error |
| CUE | no general recursion or functions | no | error |
| Jsonnet | yes, lazy | no | error |
| Nickel | yes | constrained to commutative | error |
| Pkl | yes | no | error |

Every row answers unsupported source with an error and so has no two-path agreement problem and no identity problem. This work's fallback (`F-Total`) is what removes that simplification.

## Infrastructure tools

CDK, Pulumi and Alchemy execute the program that builds the resource graph; the graph exists only as the output of a run. Terraform evaluates HCL with functions against state. Formae compiles Pkl to data. chant's own comparison covers these; the paper cites it and adds nothing.

## What is claimed as new

Per-file partial evaluation with a fallback is precedented in shape (Next.js) and in principle (CTFE). Same-function agreement through revival is CTFE's design principle. Byte-identical agreement as a tested property over a corpus was not found stated elsewhere. The contribution is the combination of per-file granularity with shared object identity across the fold and run boundary, and the bidirectional taint fixpoint (`F-Succ`, `F-Taint`, `F-CallLeak`) that makes it sound. No precedent for that fixpoint was found.

## Citations to confirm before submission

Jones, Gomard, Sestoft 1993. Taha and Sheard 1997. Heldal and Hughes 1997 and 2000, full text. The D specification's CTFE section, primary text. Siek et al. 2015 for the gradual guarantee, if the analogy is used.
