/**
 * The Rust evaluator as a WebAssembly module (#86): the same crate compiled
 * to `wasm32-unknown-unknown`, instantiated once with no imports and called
 * in place, with no process spawned. The claim this file holds is that the
 * embedded form is the same evaluator: it passes every data-host fixture,
 * agrees with the reference, and agrees with the native binary answer for
 * answer, so a host that embeds the module gets what the corpus measured.
 */
import { describe, test, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtures, runFixtures, compareAdapters } from "./index";
import { readFileSync } from "node:fs";
import { rustAdapter, rustEvaluatorPath, rustWasmAdapter, rustWasmPath, wasmImportCount } from "./adapters/rust";
import { referenceDataHostAdapter } from "../../reference/src/index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..", "..");
const wasm = rustWasmPath(root);
const binary = rustEvaluatorPath(root);
const suite = wasm ? describe : describe.skip;
if (!wasm) console.warn("[rust wasm] skipped: evaluators/rust is not built for wasm32-unknown-unknown (cargo build --release --target wasm32-unknown-unknown) and TSAD_RUST_WASM is unset");

suite("the Rust evaluator as a WebAssembly module (#86)", () => {
  const embedded = wasm ? rustWasmAdapter(wasm) : (undefined as unknown as ReturnType<typeof rustWasmAdapter>);
  const fixtures = loadFixtures(join(root, "spec", "fixtures")).filter((f) => f.profiles.includes("data-host"));
  test("declares the specification version the fixtures are at, with no imports", () => {
    expect(embedded.specVersion).toBe(referenceDataHostAdapter.specVersion);
    expect(wasmImportCount(readFileSync(wasm!))).toBe(0);
  });
  test("passes every fixture tagged for the profile, skipping none", async () => {
    const reports = await runFixtures(embedded, fixtures);
    const failed = reports.filter((r) => !r.pass).map((r) => `${r.fixture}: ${r.failures.join("; ")}`);
    expect(failed, failed.join("\n")).toEqual([]);
    const skipped = reports.filter((r) => r.skipped).map((r) => r.fixture);
    expect(skipped, `skipped: ${skipped.join(", ")}`).toEqual([]);
  });
  test("agrees with the reference on every fixture", async () => {
    const dis = await compareAdapters(referenceDataHostAdapter, embedded, fixtures);
    expect(dis, dis.join("\n")).toEqual([]);
  });
  test("is the same evaluator as the binary, answer for answer", async () => {
    // Skipped, reported, when only one form is built; CI builds both.
    if (!binary) { console.warn("[rust wasm] no native binary to compare against"); return; }
    const dis = await compareAdapters(rustAdapter(binary), embedded, fixtures);
    expect(dis, dis.join("\n")).toEqual([]);
  });
});
