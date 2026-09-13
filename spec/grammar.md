# Grammar of the fold subset

Normative draft. Identifiers are `S-*`: every production here is
decidable from syntax alone. Where the folder is stricter than the shape rule
- because it also resolves names or consults a registry, the production says
so and names the `F-*` rule (judgments.md) that adds the condition. That is
the one direction permits; a production must never be stricter than the
folder.

Derived from `findSubsetViolation` (`subset.ts:289`), `fold()`
(`fold.ts:896`), `scanExports` (`fold-import.ts:591`),
`findFunctionSubsetViolation` and `findFactorySubsetViolation`, at
`e4074c17`, with the `?.` forms from chant-v0.63.0 (`11572c7a`, #2328). Node kinds are TypeScript's.

Notation: `⟨X⟩` is a nonterminal; `|` alternation; `*` zero or more; `+` one
or more. Terminals are TypeScript tokens or node kinds. Each production cites
its inventory row.

---

## 1. Module and statements, the gate

**S-Module.** A module is a sequence of top-level statements. The gate
examines **only statements carrying `export`**. Every other statement, a
non-exported `let`, a bare call, an `if`, a non-exported class, is neither
admitted nor a disqualifier: it is invisible to the gate, and its effects are
never performed. (`fold-import.ts` `scanExports`, the `continue` for
non-exported statements; L1.1.)

**S-TopConst.** `const ⟨Identifier⟩ = ⟨Expr⟩`, exported or not, is a binding
(L5.1). A destructured or uninitialized top-level `const` is not a
binding: the name is invisible.

**S-LocalFunction.** A top-level `function ⟨Identifier⟩ ( ⟨Params⟩ ) ⟨Block⟩`,
exported or not, and a top-level `const ⟨Identifier⟩ = ⟨Arrow⟩` or
`= function …`, bind the name to a project-local function (F-Bind). The body
is judged by S-FnBody at the call, never here; the name used as a value is
F-Eval-Ident's rejection.

A module is **admitted** when every exported statement matches one of
S-ExportResource … S-ExportTypeOnly. One S-Disqualify match rejects the whole
module (L1.2–L1.5).

```
S-ExportResource    ::= export const ⟨Identifier⟩ = new ⟨Expr⟩ ( ⟨Args⟩ )
S-ExportSingle      ::= export const ⟨Identifier⟩ = ⟨Expr⟩
S-ExportDestructure ::= export const { ⟨PlainElement⟩+ } = ⟨Expr⟩
S-ExportNamed       ::= export { ( ⟨Identifier⟩ ( as ⟨Identifier⟩ )? )+ }
S-ReExport          ::= export { ( ⟨Identifier⟩ ( as ⟨Identifier⟩ )? )+ } from ⟨StringLiteral⟩
S-ExportFunction    ::= export function ⟨Identifier⟩ ( ⟨Params⟩ ) ⟨Block⟩
S-ExportDefault     ::= export default ⟨Expr⟩                                -- data-host; see below
S-ExportTypeOnly    ::= export type { … }  |  a type-only element of S-ExportNamed / S-ReExport

⟨PlainElement⟩      ::= ⟨Identifier⟩ | ⟨PropertyName⟩ : ⟨Identifier⟩     -- no rest, no default, no nesting
```

Notes. S-ExportFunction: an overload signature (no body) is skipped, not a
disqualifier; the bodied declaration that follows is the export. S-ReExport:
named elements only. S-ExportNamed: a local name must be an identifier, the
TS 4.5 string module-export-name form disqualifies.

S-ExportDefault is the declarator named `default`, admitted in the
`data-host` profile; in `full` it stays a disqualifier
until chant admits it, which the profile table records as permitted and not
required. `export default function` and `export =` disqualify in both.

```
S-Disqualify ::= export default …                              -- full only; data-host admits S-ExportDefault
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

## 2. Expressions, the classifier

`⟨Expr⟩` is any production below. The shape rule is what `findSubsetViolation`
decides; an **F** note is a condition only the folder can check.

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
S-Member      ::= ⟨Expr⟩ ( . | ?. ) ⟨Identifier⟩
S-Index       ::= ⟨Expr⟩ ( [ | ?.[ ) ⟨StringLiteral⟩ | ⟨NumericLiteral⟩ ]
S-Unary       ::= ! ⟨Expr⟩ | - ⟨Expr⟩
S-Binary      ::= ⟨Expr⟩ ⟨BinOp⟩ ⟨Expr⟩
  ⟨BinOp⟩     ::= && | || | ?? | + | - | * | / | === | !== | > | < | >= | <=
S-Conditional ::= ⟨Expr⟩ ? ⟨Expr⟩ : ⟨Expr⟩
S-New         ::= new ⟨Expr⟩ ( ⟨Expr⟩* )
S-Call        ::= S-CallHelper | S-CallIntrinsic | S-CallEager | S-CallMethod | S-CompositeStep
  S-CallHelper    ::= ⟨HelperName⟩ ( ⟨Expr⟩* )
  S-CallIntrinsic ::= ⟨Identifier⟩ ( ⟨Expr⟩* )        -- registry-gated
  S-CallEager     ::= ⟨Identifier⟩ ( ⟨Expr⟩* )        -- registry-gated
  S-CallMethod    ::= ⟨Expr⟩ ( . | ?. ) ⟨Identifier⟩ ( ⟨Expr⟩* )
  S-CompositeStep ::= ⟨UnclaimedCall⟩ . step
  ⟨UnclaimedCall⟩ ::= ⟨Identifier⟩ ( ⟨Expr⟩* )     -- see S-Unclaimed
S-Reject      ::= anything else
```

Per-production conditions and divergences:

| Production | Row | Shape rule | F: what the folder adds |
|---|---|---|---|
| S-Unwrap | L2.1 | recurse into the operand |; |
| S-Literal | L2.2 | admitted | numeric → `Number(text)` |
| S-Undefined |; | an identifier, shape-valid as S-Ident | folds to `undefined` |
| S-Ident | L2.3 | always shape-valid | must resolve in `consts` then `externals`; a bare `process` is a pointed rejection; a name bound to a same-file `new` resolves only via `externals`, where F-Prebuild placed the single instance |
| S-Template | L2.5 | every span ∈ ⟨Expr⟩ | spans coerce by `ToString` |
| S-Tagged | L2.4 | interior **opaque**; not recursed | tag must be a registered, tag-foldable intrinsic; interior folds with unresolved dotted chains kept symbolic |
| S-Prop | L2.6 | key must be ⟨LiteralKey⟩ (EVL001); value ∈ ⟨Expr⟩ |; |
| S-Shorthand | L2.6 | always shape-valid | the name resolves as S-Ident |
| S-SpreadProp | L2.6 | operand ∈ ⟨Expr⟩ | operand must fold to a non-null object |
| S-Array |; | each element or spread operand ∈ ⟨Expr⟩ | spread operand must be an array |
| S-Member | L2.15 | object ∈ ⟨Expr⟩, `.` or `?.`; **S-CompositeStep takes precedence** when the member is `step` and the object is a call | on a resource-bound identifier → `{__attrRef}`; `.` on `null`/`undefined` → **refused** (L3.10); `?.` on `null`/`undefined` → short-circuits the rest of the chain to `undefined` (L3.21) |
| S-Index | L2.7 | key must be a string or numeric **literal** (EVL003); object ∈ ⟨Expr⟩, `[` or `?.[` | same as S-Member, including the `.`/`?.` distinction |
| S-Unary | L2.8 | operator ∈ {`!`, `-`} | ECMAScript coercion |
| S-Binary | L2.8, L2.9 | operator ∈ ⟨BinOp⟩; **both** sides ∈ ⟨Expr⟩ (flow-insensitive) | `&&`/`\|\|`/`??` evaluate lazily; the untaken side is never folded |
| S-Conditional | L2.9 | all three ∈ ⟨Expr⟩ | only the taken branch is folded |
| S-New | L2.10 | every argument ∈ ⟨Expr⟩, positionally; **callee shape unconstrained** | callee must be a plain identifier (L3.15); refused inside a folded function body |
| S-CallHelper | L2.11 | name ∈ `FOLDABLE_AUTHORING_HELPERS`; args ∈ ⟨Expr⟩ | name must be bound by an import from chant; not shadowed by a local `const`; refused inside a folded function body |
| S-CallIntrinsic | L2.12 | with a registry: name registered with `foldsAsCall`; **without a registry: S-Reject** | name must resolve through the file's imports; refused inside a folded function body |
| S-CallEager | L2.13 | with a registry: name registered with `foldsEagerly`; without: S-Reject | callee must resolve to a function; evaluated at fold time |
| S-CallLocal | L2.17, L5.4 | callee is an identifier this file binds by S-LocalFunction or by an import from a project specifier (`./`, `../`); args ∈ ⟨Expr⟩ | the body must satisfy S-FnBody at the call (F-Eval-CallLocal); a cross-file callee needs the module graph, so an expression-level folder refuses it |
| S-CallMethod | L2.14 | receiver ∈ ⟨Expr⟩, `.` or `?.`; args ∈ ⟨Expr⟩; method name unconstrained | receiver must fold to a real value, not a symbolic envelope; the named property must be a function. Receiver `null`/`undefined`: `.` refuses, `?.` short-circuits (L3.22) |
| S-CompositeStep | L2.15 | any call, any arguments, member exactly `step` | callee must be an *unclaimed* bare identifier (L3.20); refused inside a folded function body |
| S-Reject | L2.16 | EVL001 |; |

**S-Unclaimed.** A call is *unclaimed* when its callee is a bare identifier
that no other S-Call form claims. The callee must not be:

- a registered authoring helper
- an intrinsic the registry admits in call or eager form
- a project-local function the scope binds
- shadowed by a local `const`

Only the bare-identifier part is decidable from syntax. The four conditions
are resolution, so S-CompositeStep admits any call at shape level and
F-Eval-Member step 2 applies the full test.

**Explicitly outside the subset** (S-Reject at shape level, and rejected by
the folder): an arrow or function expression as a value (L3.1); class
expressions; `await`, `yield`; assignment and compound assignment; the comma
operator; `typeof`, `void`, `delete`, `++`, `--`; `==`, `!=`, `%`, `**`, the
bitwise operators, `in`, `instanceof`; a computed property name; a
non-literal element-access key; a call not matching any S-Call form. Optional chaining is
specified rather than merely admitted: since chant-v0.63.0 a `?.` on a nullish object
produces a chain-short-circuit value that propagates through the remaining
`.`/`[]`/`!`/`?.()` of the same chain and becomes `undefined` at its end,
which is ECMAScript's semantics.

---

## 3. Body sub-grammars

Two further statement-level grammars govern what may appear *inside* a
function the folder evaluates. Both are stricter than S-Module.

**S-FnBody**, a project-local function (L5.4):

```
S-FnParams ::= ( ⟨Identifier⟩ ( = ⟨Expr⟩ )? | { ⟨PlainElement⟩+ } )*    -- no rest, no array pattern
S-FnBody   ::= ⟨Expr⟩
             | { ( const ⟨Identifier⟩ = ⟨Expr⟩ | const { ⟨PlainElement⟩+ } = ⟨Expr⟩ )*  ( return ⟨Expr⟩? )? }
```

No generator, no `async`, no early `return`, no `let`/`var`, no uninitialized
`const`, no other statement kind. A block with no `return` evaluates to
`undefined`. Inside S-FnBody the expression grammar **loses** five
productions: S-New and S-Tagged, S-CallHelper and S-CallIntrinsic, and
S-CompositeStep (L3.16).

**S-FactoryBody**, an interpretable composite factory (L7.3–L7.5):

```
S-FactoryParams ::= ( ⟨Identifier⟩ | { ⟨PlainElement⟩+ } )?     -- at most one; no default, no rest
S-FactoryBody   ::= ⟨Expr⟩
                  | { ( const … = ⟨Expr⟩ )*  return ⟨Expr⟩ }      -- must end in return; empty body rejected
```

Inside S-FactoryBody the expression grammar **gains** `new` in any value
position and a call through a bare identifier (a nested composite, a
registered helper, an opted-in intrinsic), and a method call stays out (per
the contract above `resolveInterpretableFactory`; `checkFactoryExpression`'s
exact set is not transcribed here).

The asymmetry between the two. S-FnBody tolerates a missing `return` and
S-FactoryBody requires one, which the specification decides rather than
inherits.

---

## What this grammar does not decide

Resolution, registration, trust, the fold/run verdict and
its taint (judgments.md), and every semantic rule. A string that
parses under this grammar is *shape-admissible*; whether it folds is the
judgments' question.

---

## Rationale

Non-normative. The reasoning that motivated each rule, carried over from the retired `requirements.md`. Keyed by the rule(s) each note supports.

**S-Call** *(A call is structurally unrepresentable, with an enumerated set of exceptions)*

A function call as a value has no evaluation case, it is absent from the
mechanism, not forbidden by a rule (L2.16). The spec must enumerate the
exceptions exhaustively, and say which *kind* each is:

| Exception | Kind | Rows |
|---|---|---|
| registered authoring helper | closed allowlist, name **and** import provenance | L2.11 |
| lexicon intrinsic, call form opted in | closed allowlist, per intrinsic | L2.12 |
| project-local function with a foldable body | open, local; the callee's binding is visible in the file, which is S-CallLocal | L2.17, L5.4 |
| eagerly-evaluated lexicon function | closed allowlist, evaluates at fold time | L2.13, |
| method call on a real receiver | receiver-type condition, method never checked by name | L2.14, L3.18, L3.19 |
| `<Identifier>(...).step` | one idiom, member fixed, callee must be unclaimed | L2.15, L3.20 |

"The callee is admitted" and "the receiver is admitted" are different
admissibility rules and an implementer will conflate them.

---

**S-Module, S-Disqualify** *(Admissibility is decided at two layers: the statement gate runs first and disqualifies whole files)*

`scanExports` (L1.1–L1.6) recognizes exactly: `export const X = new Type(...)`,
`export const X = <expr>`, `export const {a, b} = <expr>`, `export {a, b}`,
`export {a, b} from "./m"`, and `export function f() {}`. Anything else
disqualifies the file: `export default`, `export * from`, an exported class,
`let`/`var`, a destructured export with a rest, nested or defaulted element.
`export type {...}` and type-only re-export elements are erased, not
disqualifiers (L1.6).

**§2** *(The expression layer)*

Every expression reachable from an admitted statement is classified by's
single definition. The admissible forms, literals, templates with spans,
object members with literal keys, element access with literal keys, the
operator sets, positional `new` arguments, are enumerated by the grammar,
not here.

**S-FnBody, S-FactoryBody** *(Two further statement-level subsets, and an asymmetry between them)*

A **project-local function** is admissible (L5.4) when its parameters bind
plainly, its body is a single expression or `const` declarations followed by
one `return`, and it is not a generator, async, rest-parameter, early-return,
or `let`/`var` function. Parameter defaults fold in the callee's scope (L5.6).
A block body with no `return` evaluates to `undefined` (L5.7).

A **composite factory** is admissible under rules 3–5 of the same
shape, except that its body **must** end in `return` and an empty body is
rejected (L7.4). The two subsets differ on exactly this point, and the
difference is open.
