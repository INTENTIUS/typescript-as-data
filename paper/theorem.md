# Theorems

Draft for #28. Two claims, stated with the exceptions inside them. Proof sketches refer to `spec/judgments.md` and `spec/divergence.md`. Mechanisation is declined; the last section says why.

## Theorem 1, one instance per entity

Let a build be `B = (F, →, P)` as in J3. J2 gives tentative verdicts and `F-Verdict` gives final ones. Let `e` be an entity produced by file `g`.

**Claim.** Exactly one object represents `e` in the build, and every reference to `e` resolves to that object.

**Proof sketch.** The proof splits on whether `g ∈ T(B)`.

Case `g ∉ T(B)`. Then `g` folded and `e` is the object in `X(g)`; `F-Memo` makes it unique within the build and `F-Count` within the file. For any `f` referring to `e`:

- a folded `f` has `f ⇝ g` (`F-Capture` or `F-CallLeak`), so `g ∈ Succ(f)`; `f ∈ T(B)` would put `g ∈ T(B)`, contradiction, so `f` holds the memoised object
- a running `f` has `f → g`, so `g ∈ Succ(f)` and `g ∈ T(B)`, contradiction, so no referrer runs

Case `g ∈ T(B)`. Then `g` runs and execution constructs `e`. For any `f` referring to `e`:

- `f → g` gives `g ∈ Succ(f)`; `f ∉ T(B)` would give `g ∉ T(B)`, contradiction, so `f` runs and imports `g` through the host module system, one module instance per file
- `f ⇝ g` puts `f ∈ T(B)` by the backward edge, and its folded capture is discarded

In neither case do a folded object and a run object for `e` coexist. ∎

**What the sketch assumes.** `F-Memo` and `F-Count` hold in the implementation. The run path yields one module instance per file; under isolation this is why every run-fallback file is bundled into one module graph (`F-IsolatedRefusal`, J2). `T(B)` exists and is finite (`F-Fix`).

**Where the argument was wrong once.** The first prose statement of the forward edge had the direction reversed. Writing `Succ` as an operator caught it (#15). The paper should keep that as evidence that the formal statement earns its place.

**What has been executed.** A second implementation, written from J2 and J3 rather than ported, computes `T(B)` by a worklist from `Seed`. Whole-build fixtures hold it to each edge in turn: a file that seeds with no edge at all, the forward edge into an import, the backward edge two hops out through a capture. A fourth is the control: the file nothing reaches, which must still fold. Falling back on everything satisfies the claim and is what a degraded implementation does. chant answers the same fixtures since chant-v0.70.1 (chant#2408), and the two implementations agree on every file: the final verdict, the verdict before taint, and for each casualty the file the edge came from and which rule it was. chant's own differential over every mixed corpus entry and the adversarial build remain the evidence from a real corpus rather than a designed one (`paper/measurements.md`).

## Theorem 2, the permitted direction of divergence

Let `shape(e, ρ)` be the classifier's verdict on expression `e` with optional registry `ρ`, and `fold(e, Γ, ρ)` the evaluator's.

**Claim.** For all `e`, `Γ`, `ρ`, if `fold(e, Γ, ρ)` succeeds then `shape(e, ρ)` accepts, except in two cases. `F-Exc-Lazy`: an operand or branch that `fold` never evaluates is outside the subset. `F-Exc-Registry`: `ρ` is absent and `e` is a call form the registry would admit.

**Proof sketch.** Both consumers import one classifier, so every syntactic question has one answer by construction. Every remaining disagreement is a resolution the classifier does not perform. `spec/divergence.md` enumerates them as `F-Div-*`, twelve rows, and each is a rejection by `fold` of something `shape` accepted. The two exceptions are the only sites where `fold` accepts something `shape` rejects, one from lazy evaluation and one from a missing registry, and each is stated with its reason. ∎

**Corollary.** Every disagreement outside `F-Exc` costs coverage and never correctness: a file the classifier passes and the folder rejects falls back to run, and never produces wrong output.

## Property 3, the round trip

Let `generate` be any function from the value domain to source in the subset, a generator in the sense of `enables.md`.

**Claim.** For every value `v` the domain admits, `fold(generate(v)) = v` in the `data-host` profile, and `fold(generate(v)) = revive(v)` in `full`, where `revive` is `F-Val-Fate`.

The argument has two halves. Completeness is `F-Val-Source` (`spec/values.md`, spec `1.5`), a table with one source form per case of `F-Val-Domain`; each form folds to its value by the rule the table cites, and the domain is closed, so the table is exhaustive. Fidelity is an obligation on each generator rather than a rule: its output is in the subset and folds to its input. The specification states the obligation in `spec/README.md`. The suite tests it through the `roundtrip` fixture kind, whose input is a namespace as data and whose expectation is that the fold of the generated source equals it. The profile split is forced, since in `full` the fold of a resource's form is a live instance and the value the round trip returns to is the revived one.

The reference carries the smallest generator that makes the property testable, one form per case with no factoring, and it passes the four `roundtrip` fixtures. One holds scalars inside containers and one a resource with attribute references to it; a third constructs a resource by spread arguments and the last carries a symbol through both intrinsic forms. Two `F-Val-Source` fixtures write the table by hand for each profile in turn. chant's three generators emit through one pipeline whose forms are the table's (inventory `L12.1` to `L12.3`). Its Kubernetes round-trip suite re-serializes generated source and compares resource count and kinds rather than bytes (`L12.4`), so the byte-level measurement over real templates is still to be taken, and chant's adapter has no `generate` hook yet. Until both exist the property is proved for the reference and stated for chant.

## Mechanisation

Declined for the submission. The venue accepts compelling arguments, exploratory implementations and substantial examples as validation. Theorem 1 has the argument above and three executed artifacts: the differential over every corpus entry including the mixed ones (`paper/measurements.md`), an adversarial build that fires both taint edges on purpose, and a second implementation held to whole-build fixtures. Theorem 2 has the shared-classifier construction and the enumerated table; a fixture per row is still owed (#24). A mechanised proof would make the claim airtight rather than accepted; if pursued it belongs in `spec/mechanization/` on its own CI job.
