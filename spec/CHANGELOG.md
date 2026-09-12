# Changelog

The versioned history of the rule set. The policy is in [`README.md`](./README.md), under "Versioning". A version names a set of rules, `S-*` and `F-*` with their normative text, and nothing else: not a chant release, not a revision of the rationale. The current version is the single line in [`VERSION`](./VERSION).

Each entry lists the rules that changed and how, in the four kinds the policy defines. A change confined to non-normative text is not versioned and is not listed here; the rationale sections and the inventory are the usual cases.

## 1.1, 2026-09-12

Tag `spec-1.1`. One addition, and a clarification that rode along.

The added rules `F-Profile` and `F-Profile-DataHost` (J2's preamble) name the two profiles an implementation may declare. `full` is every rule. `data-host` is the specification for an evaluator with no JavaScript runtime, defined as a table of subtractions from `full`; the table is the rule, and its rows say what is absent (J3, helpers, eager intrinsics), what is altered (isolation always on, revival as serialization, interpretation-only composites) and what is permitted without being required (`new`). A fixture is tagged with the profiles it belongs to (#78). Nothing in `full` changed, so an implementation of 1.0 implements 1.1's `full` profile unchanged; the minor moves because a profile is normative text.

Clarified, no rule widened or narrowed: `F-Val-Undefined` now says that an `undefined`-valued property is present in the folded namespace and travels through a spread, and that only emission drops it (#82). Both implementations already did this; the text had said only what emission does.

## 1.0, 2026-09-11

The first tagged version, `spec-1.0`. It is the rule set as it stands after the corpus cross-check of #25 ran both implementations over projects nobody wrote for the purpose, which is the first point at which the text had been checked against something other than the code it was written from.

Relative to the untagged text that preceded it, the normative changes since the identifier vocabulary settled (#46) are these.

The added rule `F-Identity` (J3) names the two identity predicates, the entity test and the reference test, and says which one is normative (#59).

The added rule `F-Prebuild` (J2) constructs every same-file `const n = new T(…)` once before any declarator is evaluated, in source order, and binds `externals[n]` to that instance. `F-Eval-Ident` step 1 had been reading this instance as "the one instance J2 pre-built" while no rule built it (#68).

Two changes followed chant releases through the provisional path. The first narrows `F-Eval-Member` step 4 so that a `.` member read on `null` or `undefined` is refused rather than yielding `undefined`, with `?.` short-circuiting as before, and adds `F-Div-Nullish` to record the divergence (#49, following `chant-v0.63.0`). The second adds `F-Div-TemplateEnvelope`, which refuses a member access or call inside a template span when the span folds to an envelope (following `chant-v0.68.0`, chant#2349).

`F-Depth` (J4) now records that every bound turns exhaustion into a fallback, while the value of the call-depth bound remains an open question in #71.

## Before 1.0

The subset was chant's, defined by its code, and moved with chant's releases. In that period it gained cross-file resolution and project-local function calls, then package exports and nested constructions as values, then the intrinsic call form. Each widened what conforming source could contain, and none was recorded as a change to a specification because there was none. The specification was extracted from chant at `e4074c17` (#12 to #17, #39) and owns the subset from #33 onward.
