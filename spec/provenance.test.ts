/**
 * The provenance gate. Each rule file opens with a "Derived from …" paragraph
 * naming the chant symbols the rules were read out of. Those names are the
 * only durable part of a citation: the line numbers that used to sit beside
 * them were taken at `e4074c17` and had drifted 10 to 139 lines against the
 * chant this repository actually pins, so every one of them resolved to
 * unrelated code. They were removed, and this gate keeps the names honest.
 *
 * Skipped when chant is not installed, the same posture corpus.test.ts takes:
 * a gate that cannot read its subject reports that rather than passing.
 */
import { describe, test, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const specDir = dirname(fileURLToPath(import.meta.url));
const chantSrc = join(specDir, "..", "node_modules", "@intentius", "chant", "src");

/** Every non-test `.ts` under chant's src, by basename and by path suffix. */
function chantFiles(): { names: Set<string>; text: string } {
  const names = new Set<string>();
  const parts: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith(".ts") && !entry.includes(".test.")) {
        names.add(entry);
        parts.push(readFileSync(p, "utf8"));
      }
    }
  })(chantSrc);
  return { names, text: parts.join("\n") };
}

/** The `…` spans of every "Derived from" paragraph, one entry per spec file. */
function provenance(): { file: string; tokens: string[] }[] {
  const out: { file: string; tokens: string[] }[] = [];
  for (const file of readdirSync(specDir).filter((f) => f.endsWith(".md"))) {
    const lines = readFileSync(join(specDir, file), "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/Derived from/.test(lines[i])) continue;
      const para: string[] = [];
      for (let j = i; j < lines.length && lines[j].trim() !== ""; j++) para.push(lines[j]);
      const tokens = [...para.join(" ").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      out.push({ file, tokens });
    }
  }
  return out;
}

// A commit hash, a version tag, and prose that happens to sit in backticks.
const NOT_A_SYMBOL = /^(?:[0-9a-f]{7,40}|chant-v[\d.]+|v[\d.]+|\d+)$/;

describe("spec provenance (the chant symbols each rule file cites)", () => {
  const available = existsSync(chantSrc);
  const paragraphs = provenance();

  test("every rule file's provenance paragraph is found", () => {
    expect(paragraphs.length).toBeGreaterThan(0);
  });

  test.skipIf(!available)("every cited chant file exists", () => {
    const { names } = chantFiles();
    const missing: string[] = [];
    for (const { file, tokens } of paragraphs)
      for (const t of tokens) {
        if (!t.endsWith(".ts")) continue;
        if (!names.has(t.split("/").pop()!)) missing.push(`${file}: ${t}`);
      }
    expect(missing).toEqual([]);
  });

  test.skipIf(!available)("every cited chant symbol exists", () => {
    const { text } = chantFiles();
    const missing: string[] = [];
    for (const { file, tokens } of paragraphs)
      for (const t of tokens) {
        if (t.endsWith(".ts") || NOT_A_SYMBOL.test(t)) continue;
        // `FoldFileResult.liveSources` is cited as a member; both halves must exist.
        for (const part of t.split(".")) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) continue;
          if (!new RegExp(`\\b${part}\\b`).test(text)) missing.push(`${file}: ${t} (${part})`);
        }
      }
    expect(missing).toEqual([]);
  });

  test("no line-number citations remain", () => {
    const stale: string[] = [];
    for (const file of readdirSync(specDir).filter((f) => f.endsWith(".md")))
      readFileSync(join(specDir, file), "utf8").split("\n").forEach((ln, i) => {
        if (/`[A-Za-z0-9/_-]+\.ts:\d/.test(ln) || /\(`:\d+`\)/.test(ln)) stale.push(`${file}:${i + 1}`);
      });
    expect(stale).toEqual([]);
  });
});
