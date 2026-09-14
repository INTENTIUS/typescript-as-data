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

`Γ = (consts, externals, depth)`
`depth` is the number of project-local function bodies being folded around
`e`, 0 at a file's top level. `H = (ρ, helpers)` is the host (hosts.md): the
intrinsic registry and the authoring-helper allowlist. `v` ranges over the
value domain (values.md), and `⟦e⟧` abbreviates `Γ, H ⊢ e ⇓ v`. Every rule
that fails does so with a located rejection.
