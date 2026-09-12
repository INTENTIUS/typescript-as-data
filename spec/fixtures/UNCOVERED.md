# Rules with no conformance fixture yet

Deliberate, and this list may only shrink (#8). Each entry names the rule and why it is still uncovered. Remove an entry when its fixture lands; the gate fails if an entry is stale.

129 of 139 rules have fixtures. Every rule below needs something the reference implementation does not have, or something no adapter can observe; the entry says which.

- `F-Div-Step` — needs `{__compositeStep}`, which has no fate in the reference implementation (no composite factory form)
- `F-Host-Composite` — needs the composite registration form `Composite(fn, "N")`, which the reference implementation does not have
- `F-Host-Generality` — says what a host may vary and what it may not; no verdict exercises it
- `F-IsolatedRefusal` — needs isolation mode, which the reference implementation does not have
- `F-NoOwnExecution` — measured by chant's `test/leftness` profile; an adapter reports verdicts and cannot observe execution
- `F-NotProject` — a file inside the host's own module tree; the reference's project is a map with no outside
- `F-Obs-Counters` — the conformance adapter exposes no counters
- `F-Obs-Provenance` — an optional capability, reported rather than asserted
- `S-FactoryBody` — needs the composite factory form, which the reference implementation does not have
- `S-FactoryParams` — needs the composite factory form, which the reference implementation does not have
