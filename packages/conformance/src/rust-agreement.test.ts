/**
 * #86 — the evaluator with no JavaScript runtime, held to the data-host
 * profile's fixtures and to agreement with the reference judged in the same
 * profile. Skips, visibly, when the binary is not built: `cargo build
 * --release` in evaluators/rust, or TSAD_RUST_EVAL naming it.
 */
import { describe, test, expect } from "vitest";
import { join } from "node:path";
import { loadFixtures, runFixtures, compareAdapters } from "./index";
import { rustAdapter, rustEvaluatorPath } from "./adapters/rust";
import { referenceDataHostAdapter } from "../../reference/src/index";

const root = join(__dirname, "..", "..", "..");
const binary = rustEvaluatorPath(root);
const suite = binary ? describe : describe.skip;
if (!binary) console.warn("[rust] skipped: evaluators/rust is not built (cargo build --release) and TSAD_RUST_EVAL is unset");

suite("the Rust evaluator (#86) in the data-host profile", () => {
  // The callback is collected even when the suite is skipped, so the adapter is made only when the binary exists.
  const rust = binary ? rustAdapter(binary) : (undefined as unknown as ReturnType<typeof rustAdapter>);
  const fixtures = loadFixtures(join(root, "spec", "fixtures")).filter((f) => f.profiles.includes("data-host"));
  test("declares the specification version the fixtures are at", () => {
    expect(rust.specVersion).toBe(referenceDataHostAdapter.specVersion);
  });
  test("passes every fixture tagged for the profile", async () => {
    const reports = await runFixtures(rust, fixtures);
    const failed = reports.filter((r) => !r.pass).map((r) => `${r.fixture}: ${r.failures.join("; ")}`);
    expect(failed, failed.join("\n")).toEqual([]);
    // Nothing is skipped: the evaluator generates as well as folds (F-Val-Source), so the round trip runs here too.
    const skipped = reports.filter((r) => r.skipped).map((r) => r.fixture);
    expect(skipped, `skipped: ${skipped.join(", ")}`).toEqual([]);
  });
  test("agrees with the reference on every fixture, independently of what the fixture expects", async () => {
    const dis = await compareAdapters(referenceDataHostAdapter, rust, fixtures);
    expect(dis, dis.join("\n")).toEqual([]);
  });
});
