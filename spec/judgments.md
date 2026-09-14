# Judgments

Normative draft. The three judgments are expression evaluation, the per-file
fold-or-run verdict, and the identity-taint fixpoint. Identifiers are `F-*`.
Every rule here needs resolution, a registry, or the module graph, and is not
decidable from syntax.

The objective all three serve, the two profiles, and the notation they are
written in are [`objective.md`](./objective.md).

- [`evaluation.md`](./evaluation.md), J1, expression evaluation `Γ, H ⊢ e ⇓ v`.
- [`verdict.md`](./verdict.md), J2, the per-file verdict `B, ι ⊢ f ⇓ fold(X, L) | run(reason)`.
- [`taint.md`](./taint.md), J3, the identity-taint fixpoint.
- [`observables.md`](./observables.md), J4, properties and observables.
