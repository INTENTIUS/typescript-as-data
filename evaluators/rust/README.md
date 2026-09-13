# tsad-eval

An evaluator for the `data-host` profile of typescript-as-data, written from `spec/*.md` in Rust on [oxc](https://oxc.rs), with no JavaScript runtime (#86). It is a conformance adapter and a column in the corpus cross-check, not a CLI and not a product.

It speaks JSON on stdin and stdout. `{"op":"version"}` answers with the specification version it declares; `shape`, `foldExport` and `foldProject` take `files`, an optional `entry` and `export`, and a `host` that is a description only, the intrinsic registry and the trust set (F-Profile-DataHost); `generate` takes a `namespace` and the same `host` and answers with `source` in the subset whose fold is that namespace, or `unavailable` with the reason (F-Val-Source). `undefined` and a non-finite number, which JSON cannot carry, travel as `{"$tsad": …}` objects the adapter in `packages/conformance/src/adapters/rust.ts` decodes.

```
cargo build --release
npx vitest run packages/conformance/src/rust-agreement.test.ts
```

The toolchain is pinned in `rust-toolchain.toml`. `src/js.rs` reproduces the ECMAScript coercions the coercion fixtures pin, `Number::toString` included; `src/eval.rs` is J1 and the shape classifier; `src/module.rs` is J2 with `ι = isolated` and no J3.
