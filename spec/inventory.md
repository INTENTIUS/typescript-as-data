# Fold mechanism inventory

Every decision point in chant core's fold path, with the requirement that covers
it. Derived from a complete read of the four files below at commit `e4074c17`
(2026-09-09); rows L3.10, L3.21, L3.22 updated to chant-v0.63.0 (`11572c7a`).

A **decision point** is anywhere the mechanism chooses between admitting and
rejecting, between evaluation modes, or between representations. One row each.
Rows are not lines of code; several rows can live in one function and one row
can span several.

| File | Lines | Read |
|---|---|---|
| `packages/core/src/fold/subset.ts` | 497 | complete |
| `packages/core/src/fold/fold.ts` | 1,440 | complete |
| `packages/core/src/fold/foldable-helpers.ts` | 251 | complete |
| `packages/core/src/discovery/fold-import.ts` | 3,930 | module doc, session/context types, scan, resolution, revival, interpretation, trust, taint, instrumentation |

The coverage column names the `S-*`/`F-*` rule that governs the row (grammar.md,
judgments.md, values.md, divergence.md, hosts.md), or **GAP** with a reason.
Since #46 it cites rules only; `R*` is retired.

---

## L1. Statement scan (`scanExports`)

The gate that runs before any expression is classified. Disqualifies whole files.

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L1.1 | admissible export shapes | `export const X = new Type(...)`, `export const X = <expr>`, `export const {a,b} = <expr>`, `export {a,b}`, `export {a,b} from "./m"`, `export function f(){}` | S-Module, S-ExportResource … S-ExportTypeOnly (grammar.md) |
| L1.2 | `export default` | disqualifies the file | S-Disqualify (grammar.md) |
| L1.3 | `export * from` | disqualifies; no enumerable element list | S-Disqualify (grammar.md) |
| L1.4 | exported class, `let`/`var` | disqualifies | S-Disqualify (grammar.md) |
| L1.5 | destructured export with rest, nested, or defaulted element | disqualifies | S-Disqualify (grammar.md) |
| L1.6 | `export type {...}` and `isTypeOnly` re-export elements | skipped, erased; not a disqualifier | S-ExportTypeOnly (grammar.md) |
| L1.7 | rationale for per-module rather than per-declaration fallback | an unfoldable export can reference or be referenced by a foldable one in ways only running proves safe | F-Total (judgments.md); S-Module rationale |

## L2. Expression shape classification (`findSubsetViolation`)

Shape only. No resolution, no evaluation.

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L2.1 | unwrapping | parenthesized / `as` / `satisfies` / `!` recurse into the inner expression | S-Unwrap |
| L2.2 | literals | string, no-substitution template, numeric, `true`, `false`, `null` admitted | S-Literal |
| L2.3 | bare identifier | always shape-valid; resolution is not this layer's question | F-Div-Ident (divergence.md) |
| L2.4 | tagged template interior | opaque; not recursed into | F-Div-Tag (divergence.md) |
| L2.5 | template expression | admitted when every span is | S-Template |
| L2.6 | object member | literal key required; shorthand always valid; spread recurses | S-Object / S-Prop / S-Shorthand / S-SpreadProp |
| L2.7 | element access key | string or numeric literal only, else EVL003 | S-Index |
| L2.8 | operators | closed sets `SUPPORTED_BINARY_OPERATORS` (13) and `SUPPORTED_UNARY_OPERATORS` (2) | S-Unary, S-Binary; F-Eval-Unary, F-Eval-Binary |
| L2.9 | flow insensitivity | every branch of `&&`/`\|\|`/`??`/`?:` must be shape-valid | F-Exc-Lazy (divergence.md) |
| L2.10 | `new` | every argument classified positionally, no props-position assumption | S-New |
| L2.11 | call; registered helper | name-only check, provenance deferred | F-Div-Provenance (divergence.md) |
| L2.12 | call; intrinsic call form | registry-gated, registry is an optional parameter | F-Exc-(divergence.md) |
| L2.13 | call; eager intrinsic | registry-gated | S-CallEager; F-Eval-CallEager |
| L2.14 | call; method (`x.y()`) | admitted unconditionally, receiver and args recursed | S-CallMethod; F-Eval-CallMethod |
| L2.15 | call; `<call>(...).step` | admitted unconditionally at the property-access node | S-CompositeStep; F-Eval-Member step 2 |
| L2.16 | any other call | violation, `callExpressionMessage` | S-Reject; F-Eval-Reject |

## L3. Expression reduction (`fold`)

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L3.1 | arrow / function expression as a value | rejected; nothing can serialize a function | F-Eval-Function; F-Val-Callable |
| L3.2 | template expression | concatenation, spans coerced by `String()`; since chant-v0.68.0 an attribute reference, intrinsic or helper envelope in a span is a located rejection (chant#2349) | F-Eval-Template |
| L3.3 | object spread | `Object.assign`; later keys win, insertion order preserved | F-Eval-Object |
| L3.4 | object spread of a non-object | rejected | F-Eval-Object; F-Div-SpreadType |
| L3.5 | array spread of a non-array | rejected | F-Eval-Array; F-Div-SpreadType |
| L3.6 | identifier not in `consts` | consult `externals`; else unresolved | F-Eval-Ident |
| L3.7 | bare `process` | pointed rejection naming build parameters | F-Eval-Ident step 4 |
| L3.8 | identifier bound to same-file `new` | only `externals` may answer; else rejected, to avoid constructing a duplicate | F-Eval-Ident step 1; F-Div-SameFileNew; F-Count |
| L3.9 | property access on a resource-bound const | `{__attrRef}` keyed by the const's name | F-Eval-Member step 1 |
| L3.10 | property access on `null`/`undefined` | ~~returns `undefined`~~ **refused** since chant-v0.63.0 (#2328); a located rejection pointing at `?.`; file falls back to run, where it throws | F-Eval-Member step 4; F-Div-Nullish |
| L3.11 | property access on a `{__resource}` envelope | `{__attrRef}` when the object is a plain identifier; **rejected otherwise** (chant#1535; silent wrong output otherwise) | F-Eval-Member step 5 |
| L3.12 | `-x`, `!x` | JS coercion | F-Eval-Unary |
| L3.13 | `&&`, `\|\|`, `??` | lazily evaluated, JS truthiness | F-Eval-Binary; F-Exc-Lazy |
| L3.14 | arithmetic and comparison | JS semantics via unchecked casts | F-Eval-Binary |
| L3.15 | `new ns.Type(...)` | rejected; a namespace-qualified constructor cannot be resolved through named imports | F-Eval-New; F-Div-NsNew |
| L3.16 | envelope-producing branches inside a folded function body | `new`, tagged template, helper call, intrinsic call and `.step` are all **refused** when `functionBodyDepth > 0` | F-Eval-New/Tagged/CallHelper/CallIntrinsic/Member step 2 (depth > 0); F-Div-Depth |
| L3.17 | eager intrinsic referenced as a bare value | rejected; "call it instead" | F-Eval-Ident step 3; F-Div-Eager |
| L3.18 | method call receiver is a symbolic envelope | rejected; else `toString` would answer with the placeholder's shape | F-Eval-CallMethod; F-Div-Method |
| L3.19 | method call, named property not a function | rejected | F-Eval-CallMethod; F-Div-Method |
| L3.20 | `.step` narrowing | only when the callee is not already a helper, intrinsic, `FoldableFunction`, or shadowed by a const (`isUnclaimedBareCall`) | F-Eval-Member step 2; F-Div-Step |
| L3.21 | optional chain on nullish (added chant-v0.63.0) | `?.` on `null`/`undefined` yields a short-circuit sentinel that propagates through the rest of the chain; further `.`/`[]`, `!`, `?.()`; and becomes `undefined` at the chain's end (`continuesOptionalChain`) | F-Eval-Member steps 3–4 |
| L3.22 | `?.()` method call on nullish (added chant-v0.63.0) | short-circuits like L3.21; a plain `.()` on nullish refuses | F-Eval-CallMethod |
| L3.23 | envelope in a plain template span (added chant-v0.68.0) | `symbolicEnvelopeKind` refuses `__attrRef`, `__intrinsic`, `__helper`; `__resource` and `__compositeStep` are not checked and still coerce | F-Eval-Template; F-Div-TemplateEnvelope (divergence.md) |

## L4. Value domain

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L4.1 | `FoldedValue` union | 9 cases | F-Val-Domain |
| L4.2 | `FoldedResource.args` | positional; authoritative when the shape is not `(props)`/`(props, attributes)`; `props` is a view | F-Val-Arity |
| L4.3 | `undefined` in the union | no stated rule | F-Val-Undefined |
| L4.4 | `FoldableFunction` | callable, never a value; explicitly **not** a `FoldedValue` | F-Val-Callable |
| L4.5 | `carriesLiveObject` | prototype other than `Object`/`Array`; and `typeof === "function"` counts as live | F-Val-Live |

## L5. Scope, resolution, and project-local calls

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L5.1 | `collectConsts` | top-level `const` with an identifier name and an initializer, single file | F-Bind |
| L5.2 | `externals` | pre-resolved imported bindings, consulted only when `consts` misses | F-Eval-Ident |
| L5.3 | shadowing | `consts` before `externals`; a local `const` defeats a registered helper or intrinsic name | F-Eval-Ident; F-Eval-CallLocal step 4 |
| L5.4 | project-local function admissibility | plain params, body is one expression or `const`s then a final `return`; no generator, async, rest param, early return, `let`/`var` | S-FnBody; F-Eval-CallLocal step 1 |
| L5.5 | body scope | folds in the **defining** module's scope, parameters bound on top | F-Eval-CallLocal step 4 |
| L5.6 | parameter defaults | folded in the callee's scope when the argument is `undefined` | F-Eval-CallLocal step 4 |
| L5.7 | block body with no `return` | evaluates to `undefined`, as running would | F-Eval-CallLocal step 5 |
| L5.8 | recursion bound | `MAX_FUNCTION_CALL_DEPTH = 32` → rejection | F-Eval-CallLocal step 2; F-Depth |
| L5.9 | `leakedIdentity` | a call returning a live object the body produced records a taint edge; one merely passed through the arguments does not | F-CallLeak; F-Eval-CallLocal step 6 |
| L5.10 | error re-anchoring | a failure inside a callee is re-thrown at the call site naming callee, file, position, reason | F-Eval-CallLocal step 7; F-Reason |
| L5.11 | `params` bare-specifier case | the one recognized bare import: `@intentius/chant/params` resolves against `FoldSession.buildParams` | F-Import (params) |
| L5.12 | `hasObjectIdentity` (added #14 read) | a captured value has identity when it is an object **or a function**; only those add to `liveSources` | F-Import (judgments.md) |
| L5.13 | namespace import of a project file (added #14 read) | resolves to a synthetic plain object of the target's `exportedValues`; capture if any entry has identity | F-Namespace (judgments.md) |
| L5.14 | namespace import of a package (added #14 read) | never resolved; the reason `new ns.Type(...)` is unreachable | F-Namespace (judgments.md), |
| L5.15 | unresolved import never referenced (added #14 read) | does not force run; failure recorded for diagnostics only | F-Reference (judgments.md) |

## L6. Revival (`reviveFoldedValue`)

The second phase. Resolves envelope names through the **folding file's own imports**.

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L6.1 | live object passthrough | `AttrRef`, `Declarable`, `CompositeInstance`, `Intrinsic` returned unchanged; the generic walk would destroy identity | F-Val-Live |
| L6.2 | `{__symbol}` | resolved via `SIMPLE_DOTTED_CHAIN` regex, then real property access | F-Val-Fate, F-Val-Symbol-Scope |
| L6.3 | `{__intrinsic}` | **revived**; real function resolved and invoked, both tag and call form | F-Val-Fate |
| L6.4 | `{__helper}` | revived | F-Val-Fate |
| L6.5 | `{__compositeStep}` | revived, then `.step` read off the real result | F-Val-Fate |
| L6.6 | `{__resource}` | revived into a real instance by the class the file's import names | F-Val-Fate, F-Val-Arity |
| L6.7 | `{__attrRef}` | **passes through unrevived**; the serializer walker accepts the envelope | F-Val-Fate |
| L6.8 | `requireLiveRefs` | inside an intrinsic's or helper's arguments a `{__attrRef}` is **rejected**, because the receiver does `instanceof` checks and `WeakRef` derefs; elsewhere it passes | F-Val-Position |
| L6.9 | composite-step args | revived with `requireLiveRefs: false`; a composite stores props rather than inspecting them | F-Val-Position |

## L7. Interpretation (the third evaluation mode)

Neither folding nor revival: the factory body is evaluated and the defining
module is never imported.

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L7.1 | rule 1; project files only | text check on the specifier; a lexicon-published composite is deliberately never interpreted | F-Call step 4; F-Host-Composite |
| L7.2 | rule 2; `export const N = Composite(<fn>, "N")` | and `Composite` must be chant's own **in the defining module** | F-Host-Composite |
| L7.3 | rule 3; at most one parameter, bound plainly | no rest, default, nested, or array pattern | S-FactoryBody |
| L7.4 | rule 4; body shape | concise expression, or `const`s then a final `return`; empty body rejected; **must end in `return`** (unlike L5.7) | S-FactoryBody |
| L7.5 | rule 5; every expression in the subset | extended with `new` in value position and calls through a bare identifier | S-FactoryBody |
| L7.6 | module-level resource reference declines | that resource is a singleton the run path shares; interpretation would not | F-Call step 4 (declines: module-level resource) |
| L7.7 | `constResolvesToResource` follows alias chains | `const a = new T(); const b = a;` cannot smuggle one in | F-Call step 4 (alias chains) |
| L7.8 | `MAX_INTERPRETATION_DEPTH` (16) | exhaustion throws a propagated depth error naming the bound; the file falls back to run (chant-v0.68.0, chant#2370; before that it degraded to invocation and still reported fold) | F-Depth |

## L8. File decision, session, and taint

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L8.1 | `FoldFileResult` | ok with entities/exportedValues/liveSources, or a reason | F-Total, F-Reason |
| L8.2 | all-or-nothing per file | one unrecognized export disqualifies everything | F-Total |
| L8.3 | `foldModule` vs `tryFoldFile` | `foldModule` is **per-export** with an ok/false entry each and silently skips non-`new` exports; `tryFoldFile` is per-file | F-Total (per-file normative) |
| L8.4 | `exportedValues` completeness | the file's whole export namespace, equal to what importing would give | F-Total |
| L8.5 | `liveSources` | non-primitive captures only; a primitive has no identity to disagree about | F-Capture |
| L8.6 | forward taint | importer of a non-folding file is tainted | F-Succ forward |
| L8.7 | reverse taint | a file whose objects were captured taints the capturing file | F-Succ backward |
| L8.8 | fixpoint | seed with non-folding files, walk both edge sets to closure | F-Taint, F-Fix |
| L8.9 | cycle detection | `FoldSession.stack`, located error naming the cycle | F-Cycle |
| L8.10 | `MAX_RESOLUTION_DEPTH` | a second bound, separate from L5.8 and L7.8 | F-Depth |
| L8.11 | per-file fold memo | a file imported by many is folded **exactly once**; every referrer shares the result | F-Memo |
| L8.12 | per-initializer-node memo | a composite call reached through several member accesses is invoked **exactly once**, "matching what actually running the file would do" | F-Count |
| L8.13 | zero declarators after the gate (added #14 read) | `run("no foldable resource exports")`; a file must export something | F-NoExports (judgments.md) |
| L8.14 | file inside chant's own module tree (added #14 read) | `run`; not project source | F-NotProject (judgments.md) |
| L8.15 | composite-call result type (added #14 read) | must be a `CompositeInstance` or `Declarable`, else run | F-Call step 7 (judgments.md) |
| L8.16 | destructure source (added #14 read) | must be a composite instance or indexable object | F-Declarator (judgments.md) |
| L8.17 | a re-export is a capture (added #14 read) | `export { a } from "./g"` adds `g` to `liveSources` when the value has identity | F-Declarator (judgments.md) |

## L9. Trust and isolation

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L9.1 | trust arm 1 | an active lexicon package of this build, matched by **text** against a closed set built from names the build resolved | F-Host-Trust arm 1 |
| L9.2 | trust arm 1, subpath | package root extracted from text and matched against the same set | F-Host-Trust arm 1 (subpath) |
| L9.3 | trust arm 2 | specifier **resolved**, path checked against chant-core's own tree; text is explicitly not enough | F-Host-Trust arm 2 |
| L9.4 | no lexicon list supplied | arm 1 disabled entirely rather than loosened | F-Host-Trust (no package list) |
| L9.5 | sandboxed refusal | a fold needing an untrusted import is demoted to run; not an error | F-IsolatedRefusal |
| L9.6 | bare-specifier resolution cache is process-wide | documented as unsound for nested `node_modules` with a version override; the same assumption bundlers make | F-Host-Trust (stated assumption) |

## L10. Observables and side outputs

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L10.1 | `FoldExecutionCounts` | `factoryInvocations`, `projectFactoryInvocations`, `factoryInterpretations`; process-wide, monotonic, resettable | F-Obs-Counters |
| L10.2 | provenance | `setPathProvenance` records which composite parameter produced which emitted field, first (innermost) writer wins | F-Obs-Provenance |
| L10.3 | per-file decision line | `[fold:fold]` / `[fold:run] <reason>`, summarized without `--verbose` | F-Obs-Report |
| L10.4 | `FoldError` | located, carries an EVL rule id, constructed with `stackTraceLimit = 0` | F-Reason |
| L10.5 | one wording per rejection kind | shared message builders so two sites cannot drift | F-Obs-Messages |

---

## Coverage summary

**The rule for the column.** A row is *covered* only when a specific rule -
`S-Template`, `F-Eval-Member step 4`, `F-Val-Fate`, governs what the row
does. A citation of a whole file or judgment is not coverage. A partially
covered row is GAP. There is no double counting. #44's gate checks that every
cited identifier is defined in a spec file.

The first version of this file broke that rule on fourteen rows and reported
44 covered / 58 gaps; #45 corrected it to 32 / 67. After the #41 rewrite of
`requirements.md`:

| | Rows | Covered | GAP |
|---|---|---|---|
| L1 statement scan | 7 | 7 | 0 |
| L2 shape classification | 16 | 16 | 0 |
| L3 expression reduction | 23 | 23 | 0 |
| L4 value domain | 5 | 5 | 0 |
| L5 scope and local calls | 15 | 15 | 0 |
| L6 revival | 9 | 9 | 0 |
| L7 interpretation | 8 | 8 | 0 |
| L8 file decision and taint | 17 | 17 | 0 |
| L9 trust and isolation | 6 | 6 | 0 |
| L10 observables | 5 | 5 | 0 |
| **total** | **111** | **111** | **0** |

**Row identifiers are stable and append-only.** `L3.10` names one decision
point forever; a new row in a layer takes the next number and nothing is ever
renumbered. A row that turns out to be wrong is struck through with a note, not
removed, so a citation of it stays resolvable. This is the same stability rule
#6 gives rule identifiers, for the same reason: #44's gate cites these.

**20 findings beyond the 14 the review already knew about.** They are marked
`GAP (new)` above. The ones that change a requirement rather than adding one:

- **L3.10**, property access on `null`/`undefined` returns `undefined` where
  JavaScript throws. The mechanism does not inherit JS semantics wholesale, so
  F5 cannot be discharged by saying "as JavaScript".
- **L6.3**, `{__intrinsic}` is revived, not passed through. `requirements.md`
  the first requirements draft stated the opposite. F6 is now answered. F-Val-Fate: **only `{__attrRef}` survives to
  serialization**, and even that is rejected in a live-ref position (L6.8).
- **L5.9**, identity leaks through project-local function calls, not only
  through imports. The first taint description missed this; F-CallLeak carries it.
- **L8.12**, a composite call reached through several member accesses is
  invoked exactly once. Evaluation *count* is observable semantics, not an
  optimization, and no requirement says so.
- **L3.16**, five constructs that fold at a file's top level are refused inside
  a folded function body. Admissibility is scope-dependent, which no requirement
  currently allows for.

## What this inventory does not cover

`fold-import.ts` was read for decision points, not line by line end to end. The
two regions the first version named as unread, the member-access and
destructuring paths around `resolveLiveValue`, and `buildExternals`'s
namespace-import handling, were read for #14 (J2) and produced rows
L5.12–L5.15 and L8.13–L8.17. No known unread region remains at the
decision-point level; #44's precondition is met.
