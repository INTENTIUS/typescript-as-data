# Rules over values

Normative. The contract a semantic check runs under. It names the input a
check sees and when it runs, what a check may do and what it reports, and
who supplies it. The identifiers are `F-Rule-*` (#79). This is neither a
language for writing checks nor any particular check; those are host
vocabulary, a lexicon's or a governance tool's. What is specified is the
guarantee the fold provides and nothing else does. A check sees the values
of every file in the build before anything is emitted, so the check at the
keystroke is the check in CI, over real data and across resources.

Derived from chant's post-synthesis engine (`packages/core/src/lint/post-synth.ts`),
its policy layer (`lint/policy.ts`), and its severity configuration
(`lint/config.ts`), at `chant-v0.71.0`. chant's declarative `rule({…})`
format matches AST nodes and is the classifier's territory (grammar.md);
it is not a rule over values and is not covered here.

## F-Rule-Input (what a rule sees)

A check receives one or both of two inputs and nothing else about the
build. The first is the folded namespace, every file's `X(f)` after J2 and
J3 have disposed of every verdict, as final values; in chant this is
`PostSynthContext.entities`, every declared entity by name (L11.1). The
second is the artifact, the serializer's output as text and the same output
parsed once per build into documents (rows `L11.2` and `L11.3`). The name of the
environment or stack being built may be supplied as well, which is what
lets an organisational policy vary by environment (L11.4).

## F-Rule-Phase (when a rule runs)

Checks run after every verdict is final and before anything is applied. A check over the folded namespace is **pre-synthesis**; a check over the
artifact is **post-synthesis**. One hook may serve both, as chant's
does: the phase is named by the input the rule reads, not by a separate
entry point.

## F-Rule-Pure (what a rule may do)

A check is a function of its input. No execution of project code, no
environment read beyond the name F-Rule-Input supplies, no network,
deterministic across runs. This is F-Host-Admission's third clause applied
to rules, and it is what lets a check run in an editor. Under
`ι = isolated`, a check the project supplies is itself project code and runs
where the fallback runs, never in the evaluator's own process (L11.7).

## F-Rule-Finding (what a rule reports)

A finding carries the rule's identifier, a severity from a closed set
(`error`, `warning`, `info`), a message, and a **subject**: the name of the
entity in the namespace or artifact it concerns, or the statement that
something is missing when there is nothing to attach it to (L11.5). The
message is not normative (F-Obs-Messages). A source location is part of a
finding when the implementation has value provenance (F-Obs-Provenance);
it is not required, because chant's findings name the artifact's entity and
not a line, and a rule that reaches through the artifact has no line to
name. A configured severity may override the rule's own (L11.6).

## F-Rule-Equivalence (the guarantee)

For conforming source, a rule's findings are the same whether the build
folded the file or ran it. This follows from the objective (judgments.md)
and from F-Rule-Pure: the inputs are equal on both paths and the rule is a
function of them. It is what "the check at the keystroke is the check in
CI" means, stated as a property.

## F-Rule-Supply (who supplies a rule)

Rules come from the host, as part of a lexicon (F-Host-Interface item 7),
or from the project, as a policy the build loads by path. A supplied rule is
identified by its identifier; two suppliers may not claim one (L11.8). The
profile decides the language: in `data-host` a rule is code in the
evaluator's own language, since there is no JavaScript to run.

---

## Rationale

Non-normative, as in the other rule files: the reasoning behind each rule, keyed by the rules it supports.

**F-Rule-Input, F-Rule-Phase.** The fold's user-facing consequence, and the
one the paper had not stated: a syntax linter sees tokens and a
configuration language with constraints in the type sees one field; neither
has the values of every file in the build. chant's post-synthesis checks
read `ctx.entities` for the values and `ctx.outputs` or `ctx.docs` for the
artifact, from one hook, which is why the phase is named by the input.

**F-Rule-Finding.** The subject is an artifact-side name on purpose. chant's
own comment says a finding names an identifier from the synthesized output
such as a CloudFormation logical id and never a source line, and it carries
a missing-resource form for the case where nothing exists to attach to
(chant#2113, Snyk's policy-engine archetype).
Requiring a source line would require value provenance everywhere, which
`F-Obs-Provenance` deliberately leaves optional.

**F-Rule-Pure, F-Rule-Supply.** A project policy is project code. chant
refuses to load one into its own process while the sandbox is armed and
runs it in the child instead (chant#1131), which is the isolation mode's
boundary drawn once more around rules.

**Fixtures.** No `F-Rule-*` rule has a fixture yet: the harness has no hook
that runs a rule and no fixture kind whose expectation is a finding. That
work is #101; until it lands the family is listed in `fixtures/UNCOVERED.md`
with that reason.
