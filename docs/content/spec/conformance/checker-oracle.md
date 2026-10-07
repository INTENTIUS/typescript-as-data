---
title: "The checker oracle"
description: "Checking a folded value against the type the TypeScript checker gives its export, with nothing executed."
weight: 6
---

`packages/conformance/src/oracle.ts` checks each folded export against the
type `tsc` infers for it. It runs nothing, so it applies where nothing can be
run: the `data-host` profile and the Rust evaluator, which has no JavaScript
runtime.

Under `full`, a folded file is checked against running it. Under `data-host`
there is no run path. The round trip `fold(generate(v)) = v` is the only other
check there, and it shows an evaluator agreeing with itself. The checker is a
second, independent reader of the same source. A fold that drops a key in a
spread, or yields `undefined` from a member access that the checker sees as a
string, disagrees with it.

The oracle is only a test. The specification does not read
values off the checker, and a `.d.ts` literal type is never trusted to fold a
package import.

## Forcing literal types

By default the checker widens. `export default { target: "es5" }` has the
type `{ target: string }`, and almost any value is assignable to that.
So the oracle works on a copy of the build in which every top-level `const`
initializer and every `export default` expression that is data is wrapped in
an identity function with a `const` type parameter:

```ts
declare function __tsad_exact<const T>(v: T): T;
export default __tsad_exact({ target: "es5" });
// typeof import("./config").default is { readonly target: "es5" }
```

A `const` type parameter makes the checker infer its argument as if it were
written `as const`. The bindings an export reads from are wrapped too, so a
spread or a shorthand property keeps its literals. Calls and constructions
are left as they are, and so are functions and classes.

## Comparing both ways

The folded value is written as a literal type, and the oracle requires the
export's type and that literal type to be assignable to each other. One
direction alone misses half the errors: a value that lacks a key is still
assignable from the export's type, and a value with an extra key is still
assignable to it. For literal types, mutual assignability is equality, so
any difference fails.

## Unchecked, never pass

The checker does not always have a literal. `7 / 2` is a `number` and a
conditional is a union of both branches. A function call has its return type.
A name the checker cannot resolve gives a type it could not compute. At
such a node the oracle cannot tell a right value from a wrong one, so it does
not say "pass".

Every node of the folded value is probed. A node is exact when the checker's
type there is a single literal, a tuple, or an object with no index signature
and no optional or function-valued member. Anything else, including `string`,
`boolean`, a union, `any`, `unknown`, an array type and a class instance, is
not exact. A leaf under a node that is not exact is unchecked. An export whose
leaves are all checked can pass; an export with an unchecked leaf is reported
as unchecked, with the topmost paths, such as `$.ports[0].containerPort`.
Where a node is unchecked the comparison uses the checker's own type there,
so the value still has to be assignable to it.

The report gives the share of leaves that were checked. The oracle is worth
as much as that share.

## Public tsc only

The oracle does not use the checker API. It emits a file per build, with
lines like these, and runs `tsc` on the whole batch:

```ts
type __E0 = (typeof import("./config"))["default"];
declare const __f0: { "target": "es5" };
const __cf0: __E0 = __f0;                            // the value into the checker's type
declare const __e0: __E0;
const __cr0: __Or<__At<__E0, []>, { readonly "target": __Or<__At<__E0, ["target"]>, "es5"> }> = __e0;
const __p0_1: __Probe<__At<__E0, []>> = true;        // one probe per node
```

Each diagnostic is mapped back to the export and path by its line. The probes
are type-level conditionals, so the only thing read from the compiler is
whether a line has an error. That keeps the method on the command-line
interface, and it runs the same under TypeScript 7's native compiler: set
`TSAD_ORACLE_TSC` to its command, or pass `tsc` in the options.

A probe is written to error where the node is exact and to stay silent
otherwise. The other way round would read a type the checker could not
compute as exact, since every conditional over such a type gives the same
uncomputed type and an assignment to it never errors.

## Scope

The oracle judges plain-data exports. An export that constructs with `new`,
or whose fold holds a live instance, a function or an envelope such as
`__intrinsic` or `__compositeStep`, is out of scope. Its type is an instance
or a factory's result type and carries no values. Out of scope is not a
failure.

## Expected failures

Take a lying assertion like `"es5" as unknown as "esnext"`. It folds to its
operand under `S-Unwrap`, while the checker believes the assertion. The two
disagree by design. A fixture that uses one is listed in `EXPECTED_FAILURES`
with the reason. The list is empty today, because the one assertion among the
`data-host` fixtures widens to `string` and is unchecked. Any other failure is
either an evaluator bug or an oracle bug, and the test names it.

## Where it runs

`src/oracle.test.ts` runs the oracle over `spec/fixtures/`, folded by the
reference in `data-host`. It fails on a failure the expected list does not
name, and on an expected failure that no longer fails. As a control, it
alters the value of every export that passed and requires the altered value
to fail. A leaf is changed, a key or element is dropped, and one is added.

In the [corpus cross-check](/typescript-as-data/spec/conformance/corpus/),
`addOracleColumn` adds the oracle as a third column beside fold and run, over
the reference's results for every entry, in one `tsc` run that resolves
packages from the chant checkout. The report gives the counts and the literal
coverage.
