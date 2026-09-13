#!/usr/bin/env bash
# Build the Rust evaluator for the browser and copy it where the docs site
# serves it: docs/static/tsad-eval/tsad-eval.wasm, which the try-it page
# loads to fold a file in place. Needs the pinned toolchain with the
# wasm32-unknown-unknown target (rustup target add wasm32-unknown-unknown).
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
(cd "$root/evaluators/rust" && cargo build --release --locked --target wasm32-unknown-unknown)
mkdir -p "$root/docs/static/tsad-eval"
cp "$root/evaluators/rust/target/wasm32-unknown-unknown/release/tsad_eval.wasm" "$root/docs/static/tsad-eval/tsad-eval.wasm"
echo "docs/static/tsad-eval/tsad-eval.wasm: $(wc -c < "$root/docs/static/tsad-eval/tsad-eval.wasm") bytes"
