# The objective

**At a fixed build-parameter binding, folding a file and running it are
observationally equivalent.**

A source file may be reduced from its AST to the entities it declares, or
imported and executed, and the build cannot tell which happened from the
output.

In chant a differential over the example corpus discharges it. The two paths
must produce identical errors and byte-identical serialized output. It builds
every non-empty entry both ways, mixed entries included, which is where the
requirements of the judgments actually fire. See Validation status in
[`taint.md`](./taint.md).

The binding is part of the statement. `params.<name>` folds to
a literal supplied at build invocation (F-Import, J2), so output is a function of source
*and* binding; "same source, same output" is true only with the binding held
fixed.

Naming the binding is what makes that statement checkable. A value coming in
from the shell does not carry its origin and cannot be reproduced from the
source alone. It reaches the artifact as a string indistinguishable from one
an author typed. No inspection of the output can find it. A file that read one
is reported as folded while two builds of it disagree. A declared parameter is
the same value with its origin attached.

Equivalence is what makes the fallback safe and the fallback is what
distinguishes this from a configuration language that rejects out-of-subset
source. What is new, per [`prior-art.md`](./prior-art.md), is that the
fallback coexists with shared object
identity across the fold/run boundary, which is why J2 and J3 exist.

---

## Profiles

A profile names the subset of this specification an implementation claims.
Two exist. An implementation declares which it implements alongside the
version (README, Versioning) and the conformance suite judges it on the
fixtures tagged for that profile and no others.

**F-Profile.** The `full` profile is every rule in this document set,
including the `run` fallback and J3, which need a JavaScript runtime. It is
the profile chant implements. A rule with no profile annotation belongs to it.

**F-Profile-DataHost.** The `data-host` profile is the specification for an
evaluator that has no JavaScript runtime: the evaluator a platform written in
another language embeds, or a JavaScript tool that folds and never runs. It is
`full` with the following subtractions and alterations, and nothing else.

| Rule or family | In `data-host` |
|---|---|
| J1, every `F-Eval-*` rule, with ECMAScript coercion reproduced | applies in full |
| `S-*`, `F-Div-*`, `F-Direction` | apply in full |
| J2, `F-Bind` through `F-Total` | apply, with `ι = isolated` always (`executing` is unavailable, there being nothing to invoke) and F-IsolatedRefusal the only fallback: a file that does not fold is an **error**, never a demotion to `run` |
| J3, `F-Seed` through `F-Verdict`, `F-Capture`, `F-CallLeak`, `F-Memo` | absent. Nothing runs, so nothing taints, and every file's verdict is its own |
| `F-Val-Fate` | altered: revival is serialization. An envelope is the output; `{__resource}`, `{__intrinsic}` and `{__attrRef}` reach the artifact as data for the host's serializer to map. No constructor and no function is invoked |
| `F-Eval-CallHelper`, `F-Eval-CallEager`, `F-Host-Admission`, `F-Host-NoSubstitution` | absent: there is nothing to invoke. A registered helper or eager name is an ordinary unresolved identifier |
| `F-Eval-Tagged`, `F-Eval-CallIntrinsic` | apply; the envelope stays an envelope |
| `F-Val-Source` | applies, and the round trip is `fold(generate(v)) = v` literally: no fate runs, so the fold of a form is the envelope itself. The helper and composite-step cases are absent with their rules |
| `F-Call`, `F-Host-Composite` | interpretation only (step 4). A factory that is not interpretable is an error, never invoked |
| `S-LocalFunction`, `S-CallLocal` | apply in full: a same-file or project-imported function is called by interpretation, which needs no runtime |
| `S-ExportDefault` | applies: a default export is the declarator named `default`. In `full` it is permitted, not required, and chant does not yet admit it |
| `F-Eval-New`, `F-Prebuild`, `F-Count` | permitted, not required. An implementation that supports `new` folds it to a `{__resource}` envelope and binds the same envelope at every reference; one that does not rejects `new` under `F-Eval-Reject`. A fixture that uses `new` is tagged `full` unless it says otherwise |
| `F-Host-Interface` | the host is a description, not code: the intrinsic registry (item 3), the trust set (item 5), and the serialization mapping for envelopes. Items 1, 2, 4 and 6 are absent |
| `F-Rule-*` | apply; a rule is code in the evaluator's own language (F-Rule-Supply). A source location in a finding stays optional, since provenance is |
| `F-Obs-Counters` | trivially satisfied: every counter is zero |
| `F-NoOwnExecution`, `F-Obs-Report`, `F-Obs-Messages`, `F-Reason` | apply in full |

The objective above still holds, read against any JavaScript engine: a
`data-host` fold of a file and a run of the same file in JavaScript are
observationally equivalent on every file the profile folds, and a consumer
may offer both and diff them. Where the profile refuses, the run is not
consulted.

---

## Notation

The rules are written in three conventions borrowed from three places. A
reader who has met none of them can read every rule from this section alone.
Nothing here is normative. It says what the symbols mean rather than what
the rules require.

### Judgments

```
Γ, H ⊢ e ⇓ v
```

Read it left to right: **in environment `Γ` with host `H`, expression `e`
evaluates to value `v`.** The turnstile `⊢` is "in this context", and the
double arrow `⇓` is "evaluates to". This is the shape a judgment takes in
operational semantics. J1, J2 and J3 are each one judgment written this way. J2's is `B, ι ⊢ f ⇓ fold(X, L) | run(reason)`: in build `B` under
isolation mode `ι`, file `f` either folds to a namespace and a capture set,
or runs with a reason.

What stands on the left of `⊢` is whatever the judgment needs to know:

- `Γ = (consts, externals, depth)`. `depth` counts the project-local
  function bodies being folded around `e` and is 0 at a file's top level.
- `H = (ρ, helpers)` is the host (hosts.md): the intrinsic registry and the
  authoring-helper allowlist.
- `B` is the build, `ι` the isolation mode, `v` a value of the domain
  (values.md).

### Brackets

```
⟦e⟧
```

Shorthand for the judgment above, so `⟦e⟧` is "what `e` evaluates to". It
saves writing `Γ, H ⊢ e ⇓` in front of every subexpression. A rule like
`⟦!e⟧ = ¬truthy(⟦e⟧)` reads: the value of `!e` is the negation of the
truthiness of the value of `e`. Every use expands back to a judgment and
carries no meaning the judgment does not.

### The fixpoint

J3 defines the tainted set by a least fixed point:

```
T(B) = μX . Seed(B) ∪ ⋃_{f ∈ X} Succ(f)
```

`μX . …` is **the smallest `X` that satisfies what follows**. Here: the
smallest set containing the seed and closed under `Succ`. Reading it as a
procedure is also correct and is how an implementation does it. Start with
`Seed(B)` and keep adding the successors of everything in it until the set
stops growing. It stops because `F` is finite and the set only grows. `∪` is union,
`⋃` a union over many, `∈` membership, `∉` its negation, `⊆` subset.

The arrows are relations between files. `f → g` is "`f` imports or re-exports
from `g`" and `f ⇝ g` is "`f` captured an object from `g`" (F-Capture).

### Grammar

`grammar.md` uses BNF. A terminal is a TypeScript token or a node kind.

- `⟨X⟩` a nonterminal
- `|` alternation
- `*` zero or more
- `+` one or more
- `::=` "is defined as"

### Reading one rule

`evaluation.md`'s first rule is

> **F-Eval-Unwrap.** `⟦(e)⟧ = ⟦e as T⟧ = ⟦e satisfies T⟧ = ⟦e!⟧ = ⟦e⟧`

which says that four pieces of TypeScript syntax all evaluate to whatever `e`
does:

- `(e)` parenthesises it
- `e as T` asserts its type
- `e satisfies T` checks its type
- `e!` asserts it non-null

Each changes what the compiler thinks and none changes the value.

Every rule that fails does so with a located rejection.
