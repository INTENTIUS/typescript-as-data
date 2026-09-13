# tsad-eval

An evaluator for the `data-host` profile of typescript-as-data, written from `spec/*.md` in Rust on [oxc](https://oxc.rs), with no JavaScript runtime (#86). It is a conformance adapter and a column in the corpus cross-check, not a CLI and not a product.

It is one crate in two forms. `src/lib.rs` has one entry point, `handle`, a request as JSON text in and an answer as JSON text out; the binary in `src/main.rs` puts it on stdin and stdout, and the wasm exports put it in a linear-memory buffer.

The binary speaks JSON on stdin and stdout. `{"op":"version"}` answers with the specification version it declares; `shape`, `foldExport` and `foldProject` take `files`, an optional `entry` and `export`, and a `host` that is a description only, the intrinsic registry and the trust set (F-Profile-DataHost); `generate` takes a `namespace` and the same `host` and answers with `source` in the subset whose fold is that namespace, or `unavailable` with the reason (F-Val-Source). `undefined` and a non-finite number, which JSON cannot carry, travel as `{"$tsad": …}` objects the adapter in `packages/conformance/src/adapters/rust.ts` decodes.

```
cargo build --release
npx vitest run packages/conformance/src/rust-agreement.test.ts
```

The WebAssembly module is the same crate compiled for `wasm32-unknown-unknown`: four exports, `memory`, `tsad_alloc`, `tsad_eval` and `tsad_free`, and no imports, so it instantiates with an empty import object anywhere. A caller allocates a request buffer, writes the UTF-8 request, calls `tsad_eval(ptr, len)`, and reads a four-byte little-endian length followed by the UTF-8 answer at the returned pointer; both buffers are freed with `tsad_free`. `packages/conformance/src/adapters/rust.ts` has the convention in TypeScript and the docs site's browser page has it in plain JavaScript.

```
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
npx vitest run packages/conformance/src/rust-wasm-agreement.test.ts
```

That suite holds the module to the same fixtures as the binary and to the binary's own answers, so the embedded form is the evaluator the corpus measured and not a second one.

The toolchain is pinned in `rust-toolchain.toml`. `src/js.rs` reproduces the ECMAScript coercions the coercion fixtures pin, `Number::toString` included; `src/eval.rs` is J1 and the shape classifier; `src/module.rs` is J2 with `ι = isolated` and no J3.
