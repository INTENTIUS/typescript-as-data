# Grammar of the fold subset

Normative draft (#12). Identifiers are `S-*` per #6: every production here is
decidable from syntax alone. Where the folder is stricter than the shape rule
— because it also resolves names or consults a registry — the production says
so and names the `F-*` rule (judgments.md) that adds the condition. That is
the one direction R3.1 permits; a production must never be stricter than the
folder.

Derived from `findSubsetViolation` (`subset.ts:289`), `fold()`
(`fold.ts:896`), `scanExports` (`fold-import.ts:591`),
`findFunctionSubsetViolation` and `findFactorySubsetViolation`, at
`e4074c17`. Node kinds are TypeScript's.

Notation: `⟨X⟩` is a nonterminal; `|` alternation; `*` zero or more; `+` one
or more. Terminals are TypeScript tokens or node kinds. Each production cites
its inventory row.

---

## 1. Module and statements — the gate

**S-Module.** A module is a sequence of top-level statements. The gate
examines **only statements carrying `export`**. Every other statement — a
non-exported `let`, a bare call, an `if`, a non-exported class — is neither
admitted nor a disqualifier: it is invisible to the gate, and its effects are
never performed (R2). (`fold-import.ts` `scanExports`, the `continue` for
non-exported statements; L1.1.)

**S-TopConst.** `const ⟨Identifier⟩ = ⟨Expr⟩`, exported or not, is a binding
(R6.6, L5.1). A destructured or uninitialized top-level `const` is not a
binding: the name is invisible.

A module is **admitted** when every exported statement matches one of
S-ExportResource … S-ExportTypeOnly. One S-Disqualify match rejects the whole
module (R4.1, L1.2–L1.5).

```
S-ExportResource    ::= export const ⟨Identifier⟩ = new ⟨Expr⟩ ( ⟨Args⟩ )
S-ExportSingle      ::= export const ⟨Identifier⟩ = ⟨Expr⟩
S-ExportDestructure ::= export const { ⟨PlainElement⟩+ } = ⟨Expr⟩
S-ExportNamed       ::= export { ( ⟨Identifier⟩ ( as ⟨Identifier⟩ )? )+ }
S-ReExport          ::= export { ( ⟨Identifier⟩ ( as ⟨Identifier⟩ )? )+ } from ⟨StringLiteral⟩
S-ExportFunction    ::= export function ⟨Identifier⟩ ( ⟨Params⟩ ) ⟨Block⟩
S-ExportTypeOnly    ::= export type { … }  |  a type-only element of S-ExportNamed / S-ReExport

⟨PlainElement⟩      ::= ⟨Identifier⟩ | ⟨PropertyName⟩ : ⟨Identifier⟩     -- no rest, no default, no nesting
```

Notes. S-ExportFunction: an overload signature (no body) is skipped, not a
disqualifier; the bodied declaration that follows is the export. S-ReExport:
named elements only. S-ExportNamed: a local name must be an identifier — the
TS 4.5 string module-export-name form disqualifies.

```
S-Disqualify ::= export default …
               | export default function …
               | export * from …
               | export class …
               | export let …  |  export var …
               | export const ⟨Identifier⟩                    -- no initializer
               | export const [ … ] = …                       -- array pattern
               | export const { … ⟨rest | default | nested⟩ … } = …
               | export { "…" as ⟨Identifier⟩ }
```

---

## 2. Expressions — the classifier

`⟨Expr⟩` is any production below. The shape rule is what `findSubsetViolation`
decides; an **F** note is a condition only the folder can check (R3.1).

```
S-Unwrap      ::= ( ⟨Expr⟩ ) | ⟨Expr⟩ as ⟨Type⟩ | ⟨Expr⟩ satisfies ⟨Type⟩ | ⟨Expr⟩ !
S-Literal     ::= ⟨StringLiteral⟩ | ⟨NoSubstitutionTemplateLiteral⟩ | ⟨NumericLiteral⟩ | true | false | null
S-Undefined   ::= undefined
S-Ident       ::= ⟨Identifier⟩
S-Template    ::= ` ⟨text⟩ ( ${ ⟨Expr⟩ } ⟨text⟩ )+ `
S-Tagged      ::= ⟨Identifier⟩ ` … `
S-Object      ::= { ⟨Member⟩* }
  ⟨Member⟩    ::= S-Prop | S-Shorthand | S-SpreadProp
  S-Prop      ::= ⟨LiteralKey⟩ : ⟨Expr⟩
  S-Shorthand ::= ⟨Identifier⟩
  S-SpreadProp::= ... ⟨Expr⟩
  ⟨LiteralKey⟩::= ⟨Identifier⟩ | ⟨StringLiteral⟩ | ⟨NumericLiteral⟩
S-Array       ::= [ ( ⟨Expr⟩ | ... ⟨Expr⟩ )* ]
S-Member      ::= ⟨Expr⟩ . ⟨Identifier⟩
S-Index       ::= ⟨Expr⟩ [ ⟨StringLiteral⟩ | ⟨NumericLiteral⟩ ]
S-Unary       ::= ! ⟨Expr⟩ | - ⟨Expr⟩
S-Binary      ::= ⟨Expr⟩ ⟨BinOp⟩ ⟨Expr⟩
  ⟨BinOp⟩     ::= && | || | ?? | + | - | * | / | === | !== | > | < | >= | <=
S-Conditional ::= ⟨Expr⟩ ? ⟨Expr⟩ : ⟨Expr⟩
S-New         ::= new ⟨Expr⟩ ( ⟨Expr⟩* )
S-Call        ::= S-CallHelper | S-CallIntrinsic | S-CallEager | S-CallMethod | S-CompositeStep
  S-CallHelper    ::= ⟨HelperName⟩ ( ⟨Expr⟩* )
  S-CallIntrinsic ::= ⟨Identifier⟩ ( ⟨Expr⟩* )        -- registry-gated
  S-CallEager     ::= ⟨Identifier⟩ ( ⟨Expr⟩* )        -- registry-gated
  S-CallMethod    ::= ⟨Expr⟩ . ⟨Identifier⟩ ( ⟨Expr⟩* )
  S-CompositeStep ::= ⟨CallExpression⟩ . step
S-Reject      ::= anything else
```

Per-production conditions and divergences:

| Production | Row | Shape rule | F: what the folder adds |
|---|---|---|---|
| S-Unwrap | L2.1 | recurse into the operand | — |
| S-Literal | L2.2 | admitted | numeric → `Number(text)` |
| S-Undefined | — | an identifier, shape-valid as S-Ident | folds to `undefined` |
| S-Ident | L2.3 | always shape-valid | must resolve in `consts` then `externals` (R6.6); a bare `process` is a pointed rejection (R8); a name bound to a same-file `new` resolves only via `externals` (R4.6) |
| S-Template | L2.5 | every span ∈ ⟨Expr⟩ | spans coerce by `ToString` (R10.4) |
| S-Tagged | L2.4 | interior **opaque** — not recursed | tag must be a registered, tag-foldable intrinsic; interior folds with unresolved dotted chains kept symbolic |
| S-Prop | L2.6 | key must be ⟨LiteralKey⟩ (EVL001); value ∈ ⟨Expr⟩ | — |
| S-Shorthand | L2.6 | always shape-valid | the name resolves as S-Ident |
| S-SpreadProp | L2.6 | operand ∈ ⟨Expr⟩ | operand must fold to a non-null object (R10.6) |
| S-Array | — | each element or spread operand ∈ ⟨Expr⟩ | spread operand must be an array (R10.6) |
| S-Member | L2.15 | object ∈ ⟨Expr⟩; **S-CompositeStep takes precedence** when the member is `step` and the object is a call | on a resource-bound identifier → `{__attrRef}` (R10.3); on `null`/`undefined` → see R10.2 |
| S-Index | L2.7 | key must be a string or numeric **literal** (EVL003); object ∈ ⟨Expr⟩ | same as S-Member |
| S-Unary | L2.8 | operator ∈ {`!`, `-`} | ECMAScript coercion (R10.1) |
| S-Binary | L2.8, L2.9 | operator ∈ ⟨BinOp⟩; **both** sides ∈ ⟨Expr⟩ (flow-insensitive) | `&&`/`\|\|`/`??` evaluate lazily — the untaken side is never folded (R3.2) |
| S-Conditional | L2.9 | all three ∈ ⟨Expr⟩ | only the taken branch is folded (R3.2) |
| S-New | L2.10 | every argument ∈ ⟨Expr⟩, positionally; **callee shape unconstrained** | callee must be a plain identifier (L3.15, R6.3); refused inside a folded function body (R6.3) |
| S-CallHelper | L2.11 | name ∈ `FOLDABLE_AUTHORING_HELPERS`; args ∈ ⟨Expr⟩ | name must be bound by an import from chant (R3.3); not shadowed by a local `const`; refused inside a folded function body |
| S-CallIntrinsic | L2.12 | with a registry: name registered with `foldsAsCall`; **without a registry: S-Reject** | name must resolve through the file's imports; refused inside a folded function body |
| S-CallEager | L2.13 | with a registry: name registered with `foldsEagerly`; without: S-Reject | callee must resolve to a function; evaluated at fold time (R7.3) |
| S-CallMethod | L2.14 | receiver ∈ ⟨Expr⟩, args ∈ ⟨Expr⟩; method name unconstrained | receiver must fold to a real value, not `null`/`undefined`, not a symbolic envelope; the named property must be a function (R3.3) |
| S-CompositeStep | L2.15 | any call, any arguments, member exactly `step` | callee must be an *unclaimed* bare identifier (L3.20); refused inside a folded function body |
| S-Reject | L2.16 | EVL001 | — |

**Explicitly outside the subset** (S-Reject at shape level, and rejected by
the folder): an arrow or function expression as a value (L3.1); class
expressions; `await`, `yield`; assignment and compound assignment; the comma
operator; `typeof`, `void`, `delete`, `++`, `--`; `==`, `!=`, `%`, `**`, the
bitwise operators, `in`, `instanceof`; a computed property name; a
non-literal element-access key; a call not matching any S-Call form. Not
verified in this draft: optional chaining (`a?.b`) — it is a
`PropertyAccessExpression` and so shape-admitted as S-Member; its folded
semantics coincide with R10.2's current behaviour but that coincidence has
not been checked.

---

## 3. Body sub-grammars

Two further statement-level grammars govern what may appear *inside* a
function the folder evaluates. Both are stricter than S-Module.

**S-FnBody** — a project-local function (R6.5, L5.4):

```
S-FnParams ::= ( ⟨Identifier⟩ ( = ⟨Expr⟩ )? | { ⟨PlainElement⟩+ } )*    -- no rest, no array pattern
S-FnBody   ::= ⟨Expr⟩
             | { ( const ⟨Identifier⟩ = ⟨Expr⟩ | const { ⟨PlainElement⟩+ } = ⟨Expr⟩ )*  ( return ⟨Expr⟩? )? }
```

No generator, no `async`, no early `return`, no `let`/`var`, no uninitialized
`const`, no other statement kind. A block with no `return` evaluates to
`undefined`. Inside S-FnBody the expression grammar **loses** S-New, S-Tagged,
S-CallHelper, S-CallIntrinsic and S-CompositeStep (R6.3, L3.16).

**S-FactoryBody** — an interpretable composite factory (R7.2 rules 3–5, L7.3–L7.5):

```
S-FactoryParams ::= ( ⟨Identifier⟩ | { ⟨PlainElement⟩+ } )?     -- at most one; no default, no rest
S-FactoryBody   ::= ⟨Expr⟩
                  | { ( const … = ⟨Expr⟩ )*  return ⟨Expr⟩ }      -- must end in return; empty body rejected
```

Inside S-FactoryBody the expression grammar **gains** `new` in any value
position and a call through a bare identifier (a nested composite, a
registered helper, an opted-in intrinsic), and a method call stays out (per
the contract above `resolveInterpretableFactory`; `checkFactoryExpression`'s
exact set is not transcribed here — #44 precondition).

The asymmetry between the two — S-FnBody tolerates a missing `return`,
S-FactoryBody requires one — is R6.5's and is a decision the spec should make
rather than inherit.

---

## What this grammar does not decide

Resolution (R6.6), registration (R3.2), trust (R2.1), the fold/run verdict and
its taint (R4, judgments.md), and every semantic rule in R10. A string that
parses under this grammar is *shape-admissible*; whether it folds is the
judgments' question.
