# J1. Expression evaluation `Γ, H ⊢ e ⇓ v`

Derived from `fold()` (`fold.ts`), `foldResource`,
`foldTaggedTemplate`, `foldIntrinsicValue`, `callFoldableFunction`, at
`e4074c17` with chant-v0.63.0's `?.` rules. Rules are keyed to the grammar's
productions.

**F-Eval-Unwrap.** `⟦(e)⟧ = ⟦e as T⟧ = ⟦e satisfies T⟧ = ⟦e!⟧ = ⟦e⟧`. A `!`
that is part of an optional chain continues the chain (F-Eval-Member).

**F-Eval-Literal.** A string or no-substitution template folds to its text; a
numeric literal to `Number(text)`; `true`, `false`, `null` to themselves.
**F-Eval-Undefined.** The identifier `undefined` folds to `undefined`.

**F-Eval-Ident.** For identifier `n`, in order:
1. `n ∈ consts` with initializer `new …`: if `n ∈ externals`, `⟦n⟧ =
   externals[n]` (the one instance F-Prebuild put there); else
   **reject** - re-folding would construct a duplicate (F-Div-SameFileNew).
2. `n ∈ consts` otherwise: `⟦n⟧ = ⟦consts[n]⟧`.
3. `n ∈ externals`: if it is callable, a `FoldableFunction` or any function
   the host supplied, **reject** (F-Val-Callable): a callable is reached by
   `new`, by a registered call or tag, or by F-Eval-CallLocal, never as a
   value, and a registered eager name says "call it instead".
   Otherwise `⟦n⟧ = externals[n]` unchanged, a live object passes through
   (F-Val-Live).
4. `n = process`: **reject** with the build-parameters message.
5. Otherwise **reject** `unresolved identifier: n` (F-Reference).

**F-Eval-Template.** `⟦`h ${e₁} t₁ … ${eₖ} tₖ`⟧ = h ⧺ ToString(⟦e₁⟧) ⧺ t₁ ⧺ …`.
An envelope among the `⟦eᵢ⟧` is a located rejection at that span,
because a symbolic value has no string form until the build resolves it.

- chant refuses such a span on both paths and reports it at lint time as
  EVL011, and since v0.69.0 it covers every envelope kind that
  can reach a span, which inventory row L3.23 lists.

**F-Eval-Tagged.** For `tag`…``: if `depth > 0`, **reject**. If `ρ`
does not register `tag` with `isTag`, **reject**. Otherwise
`{__intrinsic: tag, strings, values}` where each interpolation is folded by
**F-Eval-Interior**.

**F-Eval-Interior.** Inside an intrinsic's interior, a tag's interpolations
or a call form's arguments, if `e` is an identifier, or a `.`/`[]`/`!`
chain rooted at one, that is not `undefined` and is in neither `consts` nor
`externals`, then `⟦e⟧ = {__symbol: text(e)}` (F-Val-Symbol-Scope).
Otherwise `⟦e⟧` as usual. A resolvable root is never symbolised: a cross-file
binding must reach the intrinsic as the shared object (J3).

**F-Eval-Object.** Members in source order into a fresh object: `k: e` sets
`k ↦ ⟦e⟧` (`k` must be a literal key, else reject); shorthand `n` sets
`n ↦ ⟦n⟧`; `...e` requires `⟦e⟧` to be a non-null object and copies its own
enumerable entries in their order, later keys winning. Any
other member kind rejects.

**F-Eval-Array.** Elements in order into a fresh array; `...e` requires
`⟦e⟧` to be an array (`Array.isArray`) and splices its elements.

**F-Eval-Member.** For `o.m` (or `o?.m`), in order:
1. If `o` is an identifier in `consts` whose initializer is `new …`:
   `⟦o.m⟧ = {__attrRef: {entity: o, attribute: m}}`, before anything
   else, the reference is by *name*.
2. If `m = step` and `o` is a call whose callee is an unclaimed bare
   identifier (L3.20): if `depth > 0` reject; else
   `{__compositeStep: callee, args: ⟦args⟧}`.
3. Let `x = ⟦o⟧`. If `x` is the chain-short-circuit sentinel: propagate it
   if this access continues the chain, else `undefined`.
4. If `x` is `null` or `undefined`: with `?.`, yield the sentinel (or
   `undefined` if nothing continues the chain); with `.`, **reject**
   naming `m` and pointing at `?.` (chant-v0.63.0).
5. If `x` is a `{__resource}` envelope: if `o` is a plain identifier,
   `{__attrRef: {entity: o, attribute: m}}`; else **reject**.
6. Otherwise `⟦o.m⟧ = x[m]`, a plain index, which on a live instance runs
   its real getter and yields a real `AttrRef` (F-Val-Live).

**F-Eval-Index.** `o[k]`: `k` must be a string or numeric literal, else
reject (EVL003). Then as F-Eval-Member with `m = k`.

**F-Eval-Unary.** `⟦!e⟧ = ¬truthy(⟦e⟧)`; `⟦-e⟧ = −ToNumber(⟦e⟧)`.
Any other operator rejects.

**F-Eval-Binary.** `&&`, `||`, `??`: the left operand folds, the right one
**only** if ECMAScript would evaluate it (falsy / truthy / nullish
respectively), and the result is ECMAScript's (F-Exc-Lazy). Every other
supported operator takes both operands folded and applies the ECMAScript
operator. An unsupported operator rejects.

**F-Eval-Conditional.** `⟦c ? t : f⟧`: `c` folds, then **only** the taken
branch (F-Exc-Lazy).

**F-Eval-New.** For `new C(a₁ … aₙ)`: `C` must be a plain identifier, else
reject (F-Div-NsNew). If `depth > 0`, reject. Then
(F-Val-Arity): with no arguments, `{__resource: C, props: {}}`; with `a₁`
an object literal and `n = 1`, `{__resource: C, props: ⟦a₁⟧}`; with `n = 2`
and both object literals, `{…, attributes: ⟦a₂⟧}`; otherwise
`{__resource: C, props: p, args: [⟦a₁⟧ … ⟦aₙ⟧]}` where `p` is the first
object-literal argument folded, or `{}`.

**F-Eval-CallHelper.** For `h(args)` with `h ∉ consts`, `h ∈ helpers` and
`externals[h]` not a `FoldableFunction`: if `depth > 0`
reject; else `{__helper: h, args: ⟦args⟧}`. A name the project bound is the
project's and F-Eval-CallLocal's; for any other binding, revival resolves
the name through the file's own import and refuses what is not the host's
(F-Host-NoSubstitution, F-Div-Provenance).

**F-Eval-CallIntrinsic.** For `i(args)` with `i ∉ consts`, `ρ` registering
`i` with `foldsAsCall` and `externals[i]` not a `FoldableFunction`:
if `depth > 0` reject; else
`{__intrinsic: i, args}` with each argument by F-Eval-Interior.

**F-Eval-CallLocal.** For `φ(args)` where `externals[φ]` is a
`FoldableFunction`, checked *before* the two registered shapes:
a name the project bound is the project's, whatever the registry says:
1. `φ`'s declaration must satisfy S-FnBody, else reject naming the reason.
2. If the implementation's call-depth bound is exceeded (F-Depth), reject
   ("call depth exceeded"). The value is the implementation's; exhaustion
   is a fallback and never wrong output.
3. A spread argument rejects. Each `aᵢ` folds in the **caller's** `Γ`.
4. The body folds in `Γ' = (consts_φ, externals_φ, depth + 1)`, the
   *defining* module's scope, with each parameter bound by removing its
   name from `consts_φ` and setting it in `externals_φ` (so it shadows);
   an object-pattern parameter destructures its argument, which must be an
   object; a missing argument with a default folds the default in `Γ'`.
5. A concise body yields `⟦body⟧`; a block yields `⟦return-expr⟧` after
   folding each `const` in order, or `undefined` if there is no `return`.
6. If the result carries a live object (F-Val-Live) that no argument
   carried, `leakedIdentity(φ)` is set (F-CallLeak, J3).
7. A rejection inside the body is re-thrown at the call, naming `φ`, its
   file, the inner position, and the reason.

**F-Eval-CallEager.** For `g(args)` with `g ∉ consts` and `ρ` registering `g`
with `foldsEagerly`: `externals[g]` must be a function, else reject; then
`⟦g(args)⟧ = g(⟦args⟧)`, evaluated now, the result possibly live.

**F-Eval-CallMethod.** For `o.m(args)` (or `o?.m(args)`): let `x = ⟦o⟧`.
If `x` is the chain sentinel, propagate. If `x` is `null`/`undefined`: with
`?.`, sentinel; with `.`, reject. If `x` is an envelope, reject, else
`toString` would answer with the placeholder's shape (L3.18). If `x[m]` is
not a function, reject. Else `⟦o.m(args)⟧ = x[m].apply(x, ⟦args⟧)`.

**F-Eval-Function.** An arrow or function expression in value position
rejects (F-Val-Callable).

**F-Eval-Reject.** Any expression matching no rule above rejects with
`unsupported expression` (S-Reject).

### What J1 does not do

Revive. Every envelope J1 produces is a finished value (F-Val-Envelope) that
J2 hands to revival. J1 executes nothing of the folded file's own, its only
executions are F-Eval-CallEager and F-Eval-CallMethod on real receivers,
both of which run code the file *imported*, not code it wrote.
