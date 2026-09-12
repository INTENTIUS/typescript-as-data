/** #18 — the reference implementation declares the specification version it implements, and it is the current one. */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { referenceAdapter } from "@intentius/tsad-reference";
import { chantAdapter } from "./adapters/chant";

const VERSION = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "spec", "VERSION"), "utf8").trim();

describe("specification version (#18)", () => {
  test("spec/VERSION is a major.minor", () => {
    expect(VERSION).toMatch(/^\d+\.\d+$/);
  });
  test("the changelog's newest entry is the current version", () => {
    const changelog = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "spec", "CHANGELOG.md"), "utf8");
    const newest = /^## (\d+\.\d+)\b/m.exec(changelog)?.[1];
    expect(newest, "CHANGELOG.md has no versioned entry").toBe(VERSION);
  });
  test("the reference implementation declares the current version", () => {
    expect(referenceAdapter.specVersion).toBe(VERSION);
  });
  test("chant's declaration is reported, not assumed", () => {
    // The pin may declare nothing yet; what must not happen is a missing
    // declaration reading as the current version.
    expect(typeof chantAdapter.specVersion).toBe("string");
    expect(chantAdapter.specVersion.length).toBeGreaterThan(0);
  });
});
