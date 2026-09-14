# J2. Per-file verdict `B, ι ⊢ f ⇓ fold(X, L) | run(reason)`

Derived from
`tryFoldFileCore` (`fold-import.ts`), `buildExternals`,
`resolveDeclaratorValue`, `resolveLiveValue`,
`resolveCallExpression`, at `e4074c17`.

`ι ∈ {open, isolated, executing}` is the isolation mode:

- `open`, the default, and strict. Nothing folds by executing project code.
- `isolated`, which refuses every project-owned invocation
  (F-IsolatedRefusal).
- `executing`, the one opt-in. F-Call may invoke a declared project function
  whose body cannot fold. The value is then what a run would compute in the
  folding process, environment included, and the build asked for that.

On `fold`, `X` is the complete export namespace and `L ⊆ F` the files whose
objects `f` captured (F-Capture, J3). Every `run(reason)` carries a located
reason.

The verdict is evaluated per file without regard to other files' verdicts
except through F-Import. It is *tentative* and J3 makes it final.

### Preconditions on the file

**F-NotProject.** A file inside chant's own module tree is not project source
and is `run("chant's own module is not project source")`. Trust is
about what may be *imported*; this is about what may be *folded*.

**F-Scan.** The statement gate (grammar §1). If any exported statement matches
S-Disqualify, `run(reason)` naming the construct. Otherwise the admitted
declarators are, in source order: resource, single, destructure,
named-export, re-export, function. In `data-host` a seventh kind, default,
is admitted as well (S-ExportDefault).

**F-NoExports.** If the gate admits the module but yields **zero**
declarators, a file with no exports, or only type-only ones, the verdict is
`run("no foldable resource exports")`. A file has to export something for
folding to have anything to produce; it is not folded to an empty namespace.

### Scope

**F-Bind.** `consts` is every top-level `const ⟨Identifier⟩ = e` (exported or not) whose `e` is not a function; `locals` is every top-level
binding the resolver may read by name, the same set, plus destructured locals
from a composite call (`const { a } = C({…})`). Every S-LocalFunction binds
its name in `externals` to a `FoldableFunction` for the file's own scope
whether or not it is exported. A same-file call therefore
reaches F-Eval-CallLocal, and a use as a value is step 3's rejection.
Resolution consults `locals`/`consts` before `externals`.

**F-Import.** For each named import binding `n` of `f`:

- *`params`*: if the build has a binding `P` and `n` is `params` from
  chant's params module, bare `@intentius/chant/params`, or a project path
  that resolves to it, then `externals[n] = P`.
- *bare specifier, active lexicon package* (arm 1): `externals[n]` is
  the package's real export, obtained by importing the already-loaded
  package. "Active" is F-Host-Interface item 5's trust set, the packages
  this build resolved and loaded; a build that supplies no package list has
  an empty set, and every bare specifier then takes the next arm
  (F-Host-Trust, L9.4). A callable export is bound like any other and is
  reached only by the form that invokes it (F-Eval-Ident step 3). A
  lexicon package is never a member of `F` and is never folded.
- *bare specifier, anything else*: **not resolved**. `n` is absent from
  `externals`; a reference to it is an unresolved identifier (F-Reference).
- *project specifier* `g`: `g` is folded first (F-Memo: at most once per
  build; F-Cycle if `g` is already on the resolution stack). If
  `B, ι ⊢ g ⇓ fold(X_g, _)` then `externals[n] = X_g[imported]`, and if that
  value has identity, `typeof` object **or function**, then `g ∈ L(f)`
  (F-Capture). If `g`'s verdict is `run`, `n` is not resolved and the reason
  is recorded against `n` for diagnostics only.

**F-Namespace.** `import * as ns from "./g"` resolves to a *synthetic plain
object* of `X_g`'s entries, so `ns.x` indexes it like any object; `g ∈ L(f)`
if any entry has identity. `import * as ns from "<package>"` is **never
resolved**, which is why `new ns.Type(...)` is rejected (L3.15): the
class is unreachable through a namespace of a package.

**F-Reference.** An identifier absent from `consts`, `locals` and
`externals` is a located rejection `unresolved identifier: n`, or the
pointed `process` message. An unresolved *import* that is never
referenced does not by itself force `run`.

### Producing the namespace

**F-Prebuild.** Every top-level `const n = new T(…)` of `f` is constructed
once by revival (F-Val-Fate) before any declarator of `f` is evaluated. This
holds whether or not `n` is exported. Construction runs in source order and
`externals[n]` is the instance. A later construction therefore sees an
earlier one, which is what running the module top to bottom does. A
construction that **fails** is skipped: `n` stays absent from `externals`, so
F-Eval-Ident step 1 rejects a reference to it and the file falls back to
`run`. If `n` is exported, F-Declarator reproduces the failure with its own
located reason. Under `ι = isolated` each construction is subject to
F-IsolatedRefusal like any other.

**F-Declarator.** Each admitted declarator produces one or more entries of
`X`. Any failure in any declarator is a failure of the file (F-Total).

- *resource* `export const x = new T(…)`: `foldResource` (J1) yields a
  `{__resource}` envelope, which is **revived** into a real instance by the
  class `T` resolves to through `f`'s own imports. F-Prebuild has
  already built this initializer, and the instance it built is the one bound
  here; a second construction would put two entities where running puts one
  (F-Count). Under `isolated`, a `T` from a project file is
  F-IsolatedRefusal.
- *single* `export const x = e`: if `e` is a call, its direct arguments are
  resolved first. An argument that is itself a package call resolves by
  F-Call, as does a member read on such a call or a const alias of either;
  every other argument is J1's (`L2.18`). Then the call is
  F-Call for an unregistered callee, or J1's registered form for a helper or
  an intrinsic. If `e` is a member or element access on a
  call's result, F-Call then index (base must be an indexable object); when
  `e` is an identifier bound by a top-level `const`,
  through any chain of such aliases (`L7.7`), to a call or to a member access
  on one, the same again, with the call resolved once per file (F-Count);
  otherwise J1 on `e`, revived (`L2.18`). A call reached any other way,
  nested inside an expression, stays J1's rejection.
- *destructure* `export const { a, b: c } = e`: `e`, through the same
  aliases, must resolve to a composite instance or an indexable object; each
  element indexes it.
- *named-export* `export { a, b as c }`: each local name resolves through
  `locals` then `externals`, by F-Eval-Ident and not by re-folding the
  initializer, so a name bound to a same-file `new` reads F-Prebuild's
  instance rather than building another.
- *re-export* `export { a } from "./g"`: `X_g[a]`, with `g ∈ L(f)` if it has
  identity, a re-export is a capture.
- *function* `export function φ`: `X[φ]` is the `FoldableFunction` F-Bind
  bound; the body's own foldability is judged at the call, never here.
- *default* `export default e` (`data-host`, S-ExportDefault): `X["default"]`
  is `⟦e⟧` revived, as *single* is; `import n from "./g"` binds it (F-Import).

**F-Call.** A call in declarator position, callee `c`:

1. `c` must be a bare identifier; otherwise `run(callExpressionMessage)`.
2. If `externals[c]` is a `FoldableFunction`, the call is J1's project-local
   call: evaluated statically, nothing imported. If that refuses, the
   file runs with F-Eval-CallLocal's reason, except under `ι = executing`
   where the call continues at step 6 as a project-owned invocation.
   chant's `open` mode invoked here until 0.72.3, and the
   invocation carried the folding process's environment into the fold.
3. Otherwise `c` must be an import binding; else `run`.
4. If the binding is *interpretable* (rules 1–5): the factory body is
   **interpreted** against the defining module's scope; the module is never
   imported; `factoryInterpretations += 1`.
5. Otherwise, under `ι = isolated`, F-IsolatedRefusal unless the binding is
   trusted.
6. Otherwise the module is imported (once per build) and `c` **invoked** with
   the resolved arguments; `factoryInvocations += 1`, and
   `projectFactoryInvocations += 1` if the specifier is a project file.
   An argument is resolved as F-Declarator says, a direct package call by
   this rule in turn and the rest by J1; a call nested deeper inside an
   argument is J1's rejection. Arguments that are live objects pass
   through unchanged; a `{__attrRef}` among them stays symbolic (`L6.9`).
7. The result is a value, live or plain, and is what the declarator binds;
   a destructured declarator needs an indexable object (F-Declarator,
   `L8.19`).

**F-Count.** Within `f`, a composite call reached by several member accesses
or destructured names is resolved once (`ResolveCtx.memo`); a same-file
`new` bound to a `const` is constructed once, in source order, by F-Prebuild
**F-IsolatedRefusal.** Under `ι = isolated`, any step above that would
resolve *and invoke or import* a binding not on the trust allowlist
(a project-owned factory, constructor, or intrinsic) is
`run("isolation")`, even where `B, open ⊢ f ⇓ fold(…)`. Interpretation (step
4) is not an invocation and is unaffected. The observable:
`projectFactoryInvocations` is zero across every folded file under
`isolated`.

### The verdict

**F-Total.** If every declarator succeeded, `fold(X, L)` where `X` maps every
exported name to its value, plain values included, and `L` is the capture
set accumulated by F-Import, F-Namespace, re-exports, and F-CallLeak (J3).
If any declarator failed, `run(reason)` for the **whole file**: no partial
namespace is ever produced.

**F-Reason.** `reason` names the declarator and carries the innermost located
cause; for a failure inside a project-local call it is re-anchored at the
call site with the callee's file and position in the message.

### What J2 does not decide

Whether `f` *finally* folds. A file with `B, ι ⊢ f ⇓ fold(X, L)` may still be
`run` after J3, because a file it imports runs (forward taint) or because a
file it captured from runs (backward taint). J2's `fold` is a proposal; J3
disposes.
