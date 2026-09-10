# Fold mechanism inventory

Every decision point in chant core's fold path, with the requirement that covers
it. Derived from a complete read of the four files below at commit `e4074c17`
(2026-09-09).

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

The coverage column names a requirement in [`requirements.md`](./requirements.md),
or **GAP** where nothing covers it. GAP rows are the input to #41-#43.

---

## L1 — Statement scan (`scanExports`)

The gate that runs before any expression is classified. Disqualifies whole files.

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L1.1 | admissible export shapes | `export const X = new Type(...)`, `export const X = <expr>`, `export const {a,b} = <expr>`, `export {a,b}`, `export {a,b} from "./m"`, `export function f(){}` | R6.1 |
| L1.2 | `export default` | disqualifies the file | R6.1 |
| L1.3 | `export * from` | disqualifies — no enumerable element list | R6.1 |
| L1.4 | exported class, `let`/`var` | disqualifies | R6.1 |
| L1.5 | destructured export with rest, nested, or defaulted element | disqualifies | R6.1 |
| L1.6 | `export type {...}` and `isTypeOnly` re-export elements | skipped, erased — not a disqualifier | R6.1 |
| L1.7 | rationale for per-module rather than per-declaration fallback | an unfoldable export can reference or be referenced by a foldable one in ways only running proves safe | R4.1 |

## L2 — Expression shape classification (`findSubsetViolation`)

Shape only. No resolution, no evaluation.

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L2.1 | unwrapping | parenthesized / `as` / `satisfies` / `!` recurse into the inner expression | GAP — R3 is about approximation direction, not unwrapping |
| L2.2 | literals | string, no-substitution template, numeric, `true`, `false`, `null` admitted | GAP — R1 defines the domain, no clause admits literal syntax |
| L2.3 | bare identifier | always shape-valid; resolution is not this layer's question | R3.1 |
| L2.4 | tagged template interior | opaque — not recursed into | R3.1 |
| L2.5 | template expression | admitted when every span is | GAP — no clause admits a template with spans (F1's sibling) |
| L2.6 | object member | literal key required; shorthand always valid; spread recurses | GAP — no clause on key shape |
| L2.7 | element access key | string or numeric literal only, else EVL003 | GAP — no clause on element-access keys |
| L2.8 | operators | closed sets `SUPPORTED_BINARY_OPERATORS` (13) and `SUPPORTED_UNARY_OPERATORS` (2) | GAP — no clause enumerates the operator sets (F5) |
| L2.9 | flow insensitivity | every branch of `&&`/`\|\|`/`??`/`?:` must be shape-valid | R3.2 |
| L2.10 | `new` | every argument classified positionally, no props-position assumption | GAP — no clause on positional `new` arguments (F11) |
| L2.11 | call — registered helper | name-only check, provenance deferred | R3.3 |
| L2.12 | call — intrinsic call form | registry-gated, registry is an optional parameter | R3.2 |
| L2.13 | call — eager intrinsic | registry-gated | R3.3 |
| L2.14 | call — method (`x.y()`) | admitted unconditionally, receiver and args recursed | R3.3 |
| L2.15 | call — `<call>(...).step` | admitted unconditionally at the property-access node | R3.3 |
| L2.16 | any other call | violation, `callExpressionMessage` | R3.3 |

## L3 — Expression reduction (`fold`)

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L3.1 | arrow / function expression as a value | rejected — nothing can serialize a function | R1.3 |
| L3.2 | template expression | concatenation, spans coerced by `String()` | GAP (F5) |
| L3.3 | object spread | `Object.assign` — later keys win, insertion order preserved | **GAP (F4, and the ordering rule is `Object.assign`'s)** |
| L3.4 | object spread of a non-object | rejected | R3.1 (divergence 3) |
| L3.5 | array spread of a non-array | rejected | R3.1 |
| L3.6 | identifier not in `consts` | consult `externals`; else unresolved | GAP — R5 is identity, not lookup order |
| L3.7 | bare `process` | pointed rejection naming build parameters | R8 |
| L3.8 | identifier bound to same-file `new` | only `externals` may answer; else rejected, to avoid constructing a duplicate | R3.1, R4.6 |
| L3.9 | property access on a resource-bound const | `{__attrRef}` keyed by the const's name | GAP — R1 lists `AttrRefValue` in the domain, no clause produces it |
| L3.10 | property access on `null`/`undefined` | **returns `undefined`; JavaScript would throw** | **GAP (new — a real divergence from JS)** |
| L3.11 | property access on a `{__resource}` envelope | `{__attrRef}` when the object is a plain identifier; **rejected otherwise** (chant#1535 — silent wrong output otherwise) | **GAP (new)** |
| L3.12 | `-x`, `!x` | JS coercion | GAP (F5) |
| L3.13 | `&&`, `\|\|`, `??` | lazily evaluated, JS truthiness | GAP — R3.2 covers laziness; truthiness semantics not stated (F5) |
| L3.14 | arithmetic and comparison | JS semantics via unchecked casts | GAP (F5) |
| L3.15 | `new ns.Type(...)` | rejected — a namespace-qualified constructor cannot be resolved through named imports | R6.3 |
| L3.16 | envelope-producing branches inside a folded function body | `new`, tagged template, helper call, intrinsic call and `.step` are all **refused** when `functionBodyDepth > 0` | R6.3 |
| L3.17 | eager intrinsic referenced as a bare value | rejected — "call it instead" | R1.3 |
| L3.18 | method call receiver is a symbolic envelope | rejected — else `toString` would answer with the placeholder's shape | R3.3 |
| L3.19 | method call, named property not a function | rejected | R3.3 |
| L3.20 | `.step` narrowing | only when the callee is not already a helper, intrinsic, `FoldableFunction`, or shadowed by a const (`isUnclaimedBareCall`) | R3.3 |

## L4 — Value domain

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L4.1 | `FoldedValue` union | 9 cases | R1 |
| L4.2 | `FoldedResource.args` | positional; authoritative when the shape is not `(props)`/`(props, attributes)`; `props` is a view | GAP — R1.5 points at it; the rule is #42's |
| L4.3 | `undefined` in the union | no stated rule | GAP (F12) |
| L4.4 | `FoldableFunction` | callable, never a value; explicitly **not** a `FoldedValue` | R1.3 |
| L4.5 | `carriesLiveObject` | prototype other than `Object`/`Array` — and `typeof === "function"` counts as live | R1.4 |

## L5 — Scope, resolution, and project-local calls

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L5.1 | `collectConsts` | top-level `const` with an identifier name and an initializer, single file | GAP — R5 is identity, not which declarations bind |
| L5.2 | `externals` | pre-resolved imported bindings, consulted only when `consts` misses | GAP — R5 does not state lookup order |
| L5.3 | shadowing | `consts` before `externals`; a local `const` defeats a registered helper or intrinsic name | R6.4 |
| L5.4 | project-local function admissibility | plain params, body is one expression or `const`s then a final `return`; no generator, async, rest param, early return, `let`/`var` | R6.5 |
| L5.5 | body scope | folds in the **defining** module's scope, parameters bound on top | GAP — a scoping rule; R5 is an identity rule |
| L5.6 | parameter defaults | folded in the callee's scope when the argument is `undefined` | R6.5 |
| L5.7 | block body with no `return` | evaluates to `undefined`, as running would | R6.5 |
| L5.8 | recursion bound | `MAX_FUNCTION_CALL_DEPTH = 32` → rejection | R4.5 |
| L5.9 | `leakedIdentity` | a call returning a live object the body produced records a taint edge; one merely passed through the arguments does not | R4.2 |
| L5.10 | error re-anchoring | a failure inside a callee is re-thrown at the call site naming callee, file, position, reason | R-spec.3 partially |
| L5.11 | `params` bare-specifier case | the one recognized bare import: `@intentius/chant/params` resolves against `FoldSession.buildParams` | R8 |

## L6 — Revival (`reviveFoldedValue`)

The second phase. Resolves envelope names through the **folding file's own imports**.

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L6.1 | live object passthrough | `AttrRef`, `Declarable`, `CompositeInstance`, `Intrinsic` returned unchanged — the generic walk would destroy identity | R5 (lead) |
| L6.2 | `{__symbol}` | resolved via `SIMPLE_DOTTED_CHAIN` regex, then real property access | R1.2 |
| L6.3 | `{__intrinsic}` | **revived** — real function resolved and invoked, both tag and call form | R1.2 |
| L6.4 | `{__helper}` | revived | R1.2 correct |
| L6.5 | `{__compositeStep}` | revived, then `.step` read off the real result | R1.2 correct |
| L6.6 | `{__resource}` | revived into a real instance by the class the file's import names | R1.2 correct |
| L6.7 | `{__attrRef}` | **passes through unrevived** — the serializer walker accepts the envelope | R1.2 correct |
| L6.8 | `requireLiveRefs` | inside an intrinsic's or helper's arguments a `{__attrRef}` is **rejected**, because the receiver does `instanceof` checks and `WeakRef` derefs; elsewhere it passes | R1.2 |
| L6.9 | composite-step args | revived with `requireLiveRefs: false` — a composite stores props rather than inspecting them | R1.2 |

## L7 — Interpretation (the third evaluation mode)

Neither folding nor revival: the factory body is evaluated and the defining
module is never imported.

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L7.1 | rule 1 — project files only | text check on the specifier; a lexicon-published composite is deliberately never interpreted | R7.2 |
| L7.2 | rule 2 — `export const N = Composite(<fn>, "N")` | and `Composite` must be chant's own **in the defining module** | R7.2 |
| L7.3 | rule 3 — at most one parameter, bound plainly | no rest, default, nested, or array pattern | R7.2 |
| L7.4 | rule 4 — body shape | concise expression, or `const`s then a final `return`; empty body rejected; **must end in `return`** (unlike L5.7) | R7.2, R6.5 |
| L7.5 | rule 5 — every expression in the subset | extended with `new` in value position and calls through a bare identifier | R7.2 |
| L7.6 | module-level resource reference declines | that resource is a singleton the run path shares; interpretation would not | R7.2 |
| L7.7 | `constResolvesToResource` follows alias chains | `const a = new T(); const b = a;` cannot smuggle one in | R7.2 |
| L7.8 | `MAX_INTERPRETATION_DEPTH` | self-referential composite terminated | R4.5 |

## L8 — File decision, session, and taint

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L8.1 | `FoldFileResult` | ok with entities/exportedValues/liveSources, or a reason | R4.1 |
| L8.2 | all-or-nothing per file | one unrecognized export disqualifies everything | R4.1 |
| L8.3 | `foldModule` vs `tryFoldFile` | `foldModule` is **per-export** with an ok/false entry each and silently skips non-`new` exports; `tryFoldFile` is per-file | R4.1 |
| L8.4 | `exportedValues` completeness | the file's whole export namespace, equal to what importing would give | R5.1 |
| L8.5 | `liveSources` | non-primitive captures only — a primitive has no identity to disagree about | R4.2 |
| L8.6 | forward taint | importer of a non-folding file is tainted | R4.2 |
| L8.7 | reverse taint | a file whose objects were captured taints the capturing file | R4.2 |
| L8.8 | fixpoint | seed with non-folding files, walk both edge sets to closure | R4.3 |
| L8.9 | cycle detection | `FoldSession.stack`, located error naming the cycle | R4.4 |
| L8.10 | `MAX_RESOLUTION_DEPTH` | a second bound, separate from L5.8 and L7.8 | R4.5 |
| L8.11 | per-file fold memo | a file imported by many is folded **exactly once**; every referrer shares the result | R5 (lead paragraph: folded exactly once per build) |
| L8.12 | per-initializer-node memo | a composite call reached through several member accesses is invoked **exactly once**, "matching what actually running the file would do" | R4.6 |

## L9 — Trust and isolation

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L9.1 | trust arm 1 | an active lexicon package of this build, matched by **text** against a closed set built from names the build resolved | R2.1 |
| L9.2 | trust arm 1, subpath | package root extracted from text and matched against the same set | R2.1 |
| L9.3 | trust arm 2 | specifier **resolved**, path checked against chant-core's own tree — text is explicitly not enough | R2.1 |
| L9.4 | no lexicon list supplied | arm 1 disabled entirely rather than loosened | R2.1 |
| L9.5 | sandboxed refusal | a fold needing an untrusted import is demoted to run; not an error | R2.2 |
| L9.6 | bare-specifier resolution cache is process-wide | documented as unsound for nested `node_modules` with a version override; the same assumption bundlers make | R2.1 |

## L10 — Observables and side outputs

| # | Decision | Behaviour | Covers |
|---|---|---|---|
| L10.1 | `FoldExecutionCounts` | `factoryInvocations`, `projectFactoryInvocations`, `factoryInterpretations` — process-wide, monotonic, resettable | R9.2 |
| L10.2 | provenance | `setPathProvenance` records which composite parameter produced which emitted field, first (innermost) writer wins | R9.1 |
| L10.3 | per-file decision line | `[fold:fold]` / `[fold:run] <reason>`, summarized without `--verbose` | R9.3 |
| L10.4 | `FoldError` | located, carries an EVL rule id, constructed with `stackTraceLimit = 0` | R-spec.3 |
| L10.5 | one wording per rejection kind | shared message builders so two sites cannot drift | R9.4 (decided not normative, with reason) |

---

## Coverage summary

**The rule for the column.** A row is *covered* only when a specific requirement
clause — `R3.3`, `R4.2`, `R-spec.3`, or a named lead paragraph — specifies what
the row does. A citation of a requirement *family* (`R3`, `R5`) is not coverage:
it means a requirement in the same neighbourhood exists, which is a different
claim. A partially covered row is GAP. There is no double counting.

The first version of this file broke that rule on fourteen rows and reported
44 covered / 58 gaps; #45 corrected it to 32 / 67. After the #41 rewrite of
`requirements.md`:

| | Rows | Covered | GAP |
|---|---|---|---|
| L1 statement scan | 7 | 7 | 0 |
| L2 shape classification | 16 | 9 | 7 |
| L3 expression reduction | 20 | 14 | 6 |
| L4 value domain | 5 | 3 | 2 |
| L5 scope and local calls | 11 | 8 | 3 |
| L6 revival | 9 | 9 | 0 |
| L7 interpretation | 8 | 8 | 0 |
| L8 file decision and taint | 12 | 12 | 0 |
| L9 trust and isolation | 6 | 6 | 0 |
| L10 observables | 5 | 5 | 0 |
| **total** | **99** | **81** | **18** |

**Row identifiers are stable and append-only.** `L3.10` names one decision
point forever; a new row in a layer takes the next number and nothing is ever
renumbered. A row that turns out to be wrong is struck through with a note, not
removed, so a citation of it stays resolvable. This is the same stability rule
#6 gives rule identifiers, for the same reason: #44's gate cites these.

**20 findings beyond the 14 the review already knew about.** They are marked
`GAP (new)` above. The ones that change a requirement rather than adding one:

- **L3.10** — property access on `null`/`undefined` returns `undefined` where
  JavaScript throws. The mechanism does not inherit JS semantics wholesale, so
  F5 cannot be discharged by saying "as JavaScript".
- **L6.3** — `{__intrinsic}` is revived, not passed through. `requirements.md`
  R1.2 states the opposite. F6 is now answered: **only `{__attrRef}` survives to
  serialization**, and even that is rejected in a live-ref position (L6.8).
- **L5.9** — identity leaks through project-local function calls, not only
  through imports. R4.2's taint story is incomplete as written.
- **L8.12** — a composite call reached through several member accesses is
  invoked exactly once. Evaluation *count* is observable semantics, not an
  optimization, and no requirement says so.
- **L3.16** — five constructs that fold at a file's top level are refused inside
  a folded function body. Admissibility is scope-dependent, which no requirement
  currently allows for.

## What this inventory does not cover

`fold-import.ts` was read for decision points, not line by line end to end. The
areas read are listed at the top. Two things are known to remain: the
member-access and destructuring resolution paths around `resolveLiveValue`, and
`buildExternals`'s namespace-import handling. Neither is expected to change the
shape of a requirement, and both should be confirmed before #44's gate is
called complete.
