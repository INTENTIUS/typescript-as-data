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
  test("chant declares a version this specification still recognises (chant#2424)", () => {
    // chant-v0.71.0 exports SPEC_VERSION. It may lag, and how far depends on
    // which kind of change is in flight.
    //
    // A MINOR lag is ordinary: the policy says an implementation of 1.0
    // implements 1.1's full profile unchanged.
    //
    // A MAJOR lag is bounded and temporary. README.md's ownership section says
    // a subset change goes spec-first -- landed here, then implemented in
    // chant, then released -- so a major necessarily opens a window where the
    // spec is ahead. Asserting same-major would forbid the very window the
    // policy requires. One major behind is allowed while that window is open,
    // and the assertion tightens back on its own once chant declares the
    // current major. Never "undeclared", in either case.
    //
    // #199 landed the rule and chant declares 2.1 on its main. The window is
    // still open because this repository pins chant from npm, and the pinned
    // release predates that. #210 is the pin bump that closes it.
    expect(chantAdapter.specVersion).toMatch(/^\d+\.\d+$/);
    const [specMajor, specMinor] = VERSION.split(".").map(Number);
    const [chantMajor, chantMinor] = chantAdapter.specVersion.split(".").map(Number);
    expect(chantMajor).toBeLessThanOrEqual(specMajor);
    expect(chantMajor).toBeGreaterThanOrEqual(specMajor - 1);
    if (chantMajor === specMajor) expect(chantMinor).toBeLessThanOrEqual(specMinor);
  });
});
