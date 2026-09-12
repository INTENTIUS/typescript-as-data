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
  test("chant declares a version of this specification's major (chant#2424)", () => {
    // chant-v0.71.0 exports SPEC_VERSION. It may lag the minor: the policy says
    // an implementation of 1.0 implements 1.1's full profile unchanged, so what
    // is asserted is a real declaration on the same major, never "undeclared".
    expect(chantAdapter.specVersion).toMatch(/^\d+\.\d+$/);
    expect(chantAdapter.specVersion.split(".")[0]).toBe(VERSION.split(".")[0]);
    expect(Number(chantAdapter.specVersion.split(".")[1])).toBeLessThanOrEqual(Number(VERSION.split(".")[1]));
  });
});
