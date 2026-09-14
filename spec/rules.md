# Rules over values

Normative. The contract a semantic check runs under. It names the input a
check sees and when it runs, what a check may do and what it reports, and
who supplies it. The identifiers are `F-Rule-*`.

This is neither a language for writing checks nor any particular check; those
are a lexicon's host vocabulary or a governance tool's. What is specified is
the guarantee the fold provides and nothing else does. A check sees the values
of every file in the build before anything is emitted and without running any
of them so it runs wherever the fold runs and gives the answer a run would
have given.

Derived from chant's post-synthesis engine (`packages/core/src/lint/post-synth.ts`),
its policy layer (`lint/policy.ts`), and its severity configuration
(`lint/config.ts`), at `chant-v0.71.0`. chant's declarative `rule({…})`
format matches AST nodes and is the classifier's territory (grammar.md);
it is not a rule over values and is not covered here.

## F-Rule-Input (what a rule sees)

A check receives one or both of two inputs, and nothing else about the build:

- The folded namespace, every file's `X(f)` after J2 and J3 have disposed of
  every verdict, as final values. In chant this is
  `PostSynthContext.entities`, every declared entity by name (L11.1).
- The artifact: the serializer's output as text and the same output parsed
  once per build into documents (rows `L11.2` and `L11.3`).

The name of the environment or stack being built may be supplied as well
which is what lets an organizational policy vary by environment (L11.4).

## F-Rule-Phase (when a rule runs)

Checks run after every verdict is final and before anything is applied. A
check over the folded namespace is **pre-synthesis** and a check over the
artifact is **post-synthesis**.

One hook may serve both as chant's does. The phase is named by the input the
rule reads.

## F-Rule-Pure (what a rule may do)

A check is a function of its input. No execution of project code, no
environment read beyond the name F-Rule-Input supplies, no network,
deterministic across runs. This is F-Host-Admission's third clause applied
to rules and it is what lets a check run in an editor. Under
`ι = isolated`, a check the project supplies is itself project code and runs
where the fallback runs, never in the evaluator's own process (L11.7).

## F-Rule-Finding (what a rule reports)

A finding carries four things:

- the rule's identifier,
- a severity from the closed set `error`, `warning`, `info`,
- a message, which is not normative (F-Obs-Messages),
- a **subject**: the name of the entity in the namespace or artifact it
  concerns, or the statement that something is missing when there is nothing
  to attach it to (L11.5).

A source location is part of a finding when the implementation has value
provenance (F-Obs-Provenance). It is not required, because chant's findings
name the artifact's entity and not a line, and a rule that reaches through the
artifact has no line to name. A configured severity may override the rule's
own (L11.6).

## F-Rule-Equivalence (the guarantee)

For conforming source, a rule's findings are the same whether the build
folded the file or ran it. This follows from the objective (objective.md)
and from F-Rule-Pure. The inputs are equal on both paths and the rule is a
function of them. It is what lets a check run before the build and mean the
same thing as one run after it.

## F-Rule-Supply (who supplies a rule)

Rules come from the host, as part of a lexicon (F-Host-Interface item 7),
or from the project, as a policy the build loads by path. A supplied rule is
identified by its identifier; two suppliers may not claim one (L11.8). The
profile decides the language: in `data-host` a rule is code in the
evaluator's own language since there is no JavaScript to run.
