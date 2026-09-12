# Rules with no conformance fixture yet

Deliberate, and this list may only shrink (#8). Each entry names the rule and why it is still uncovered. Remove an entry when its fixture lands; the gate fails if an entry is stale.

107 of 138 rules have fixtures. Most of the rules below are uncovered because the corpus is still growing (#24); where a rule needs something the reference implementation does not have, the entry says so.

- `F-Rule-Input` — the harness has no rule hook and no findings-as-data fixture kind yet (#101)
- `F-Rule-Phase` — the harness has no rule hook and no findings-as-data fixture kind yet (#101)
- `F-Rule-Pure` — the harness has no rule hook and no findings-as-data fixture kind yet (#101)
- `F-Rule-Finding` — the harness has no rule hook and no findings-as-data fixture kind yet (#101)
- `F-Rule-Equivalence` — the harness has no rule hook and no findings-as-data fixture kind yet (#101)
- `F-Rule-Supply` — the harness has no rule hook and no findings-as-data fixture kind yet (#101)
- `F-Div-Step` — needs `{__compositeStep}`, which has no fate in the reference implementation (no composite factory form)
- `F-Eval-Interior` — an unresolved chain inside an intrinsic call folds to a symbol only with a registry in scope, and an expression fixture names no host
- `F-Host-Composite` — needs the composite registration form `Composite(fn, "N")`, which the reference implementation does not have
- `F-Host-Generality` — says what a host may vary and what it may not; no verdict exercises it
- `F-IsolatedRefusal` — needs isolation mode, which the reference implementation does not have
- `F-NoOwnExecution` — measured by chant's `test/leftness` profile; an adapter reports verdicts and cannot observe execution
- `F-NotProject` — a file inside the host's own module tree; the reference's project is a map with no outside
- `F-Obs-Counters` — the conformance adapter exposes no counters
- `F-Obs-Provenance` — an optional capability, reported rather than asserted
- `F-Val-Domain` — no fixture yet; corpus is #24's
- `F-Val-Envelope` — no fixture yet; corpus is #24's
- `F-Val-Symbol-Scope` — no fixture yet; corpus is #24's
- `S-Disqualify` — no fixture yet; corpus is #24's
- `S-ExportDestructure` — no fixture yet; corpus is #24's
- `S-ExportNamed` — no fixture yet; corpus is #24's
- `S-ExportResource` — no fixture yet; corpus is #24's
- `S-ExportSingle` — no fixture yet; corpus is #24's
- `S-ExportTypeOnly` — no fixture yet; corpus is #24's
- `S-FactoryBody` — needs the composite factory form, which the reference implementation does not have
- `S-FactoryParams` — needs the composite factory form, which the reference implementation does not have
- `S-Module` — no fixture yet; corpus is #24's
- `S-Prop` — no fixture yet; corpus is #24's
- `S-ReExport` — no fixture yet; corpus is #24's
- `S-Shorthand` — no fixture yet; corpus is #24's
- `S-TopConst` — no fixture yet; corpus is #24's
