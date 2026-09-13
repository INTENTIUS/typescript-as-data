/**
 * The adapter for `evaluators/rust`, the evaluator with no JavaScript
 * runtime (#86). It is a binary that speaks JSON on stdin and stdout; this
 * adapter spawns it per call and decodes the two things JSON cannot carry,
 * `undefined` and a non-finite number, from the tagged objects the binary
 * writes. Nothing here folds anything.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ConformanceAdapter, ConformanceHost } from "../index.js";

/** The binary, from `TSAD_RUST_EVAL` or the crate's release build; `undefined` when neither exists. */
export function rustEvaluatorPath(root = process.cwd()): string | undefined {
  const env = process.env.TSAD_RUST_EVAL;
  if (env) return existsSync(env) ? env : undefined;
  const built = join(root, "evaluators", "rust", "target", "release", "tsad-eval");
  return existsSync(built) ? built : undefined;
}

function decode(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.$tsad === "undefined") return undefined;
    if (o.$tsad === "number") return Number(o.text);
    if (o.$tsad === "function" || o.$tsad === "host") return o;
    return Object.fromEntries(Object.entries(o).map(([k, e]) => [k, decode(e)]));
  }
  return v;
}

/** The inverse of decode, for a value the harness sends in (generate's namespace). */
function encode(v: unknown): unknown {
  if (v === undefined) return { $tsad: "undefined" };
  if (typeof v === "number" && !Number.isFinite(v)) return { $tsad: "number", text: String(v) };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, e]) => [k, encode(e)]));
  return v;
}

function hostDescription(h?: ConformanceHost) {
  // F-Profile-DataHost: the host is a description, the registry and the trust set.
  return h ? { intrinsics: h.intrinsics, ownedSpecifierPrefixes: h.ownedSpecifierPrefixes } : {};
}

export function rustAdapter(binary: string): ConformanceAdapter {
  const call = (req: Record<string, unknown>): Record<string, unknown> => {
    const out = execFileSync(binary, [], { input: JSON.stringify(req), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const r = JSON.parse(out) as Record<string, unknown>;
    if (r.error) throw new Error(`tsad-eval: ${r.error}`);
    return r;
  };
  const version = call({ op: "version" }) as { specVersion: string; name: string };
  return {
    name: version.name,
    specVersion: version.specVersion,
    shape(source, exportName) {
      const r = call({ op: "shape", files: { "input.ts": source }, entry: "input.ts", export: exportName }) as { accepted: boolean; rule?: string; line: number; column: number; message: string };
      return r.accepted ? { accepted: true } : { accepted: false, rule: r.rule, line: r.line, column: r.column, message: r.message };
    },
    foldExport(source, exportName) {
      const r = call({ op: "foldExport", files: { "input.ts": source }, entry: "input.ts", export: exportName }) as { ok: boolean; value?: unknown; rule?: string; line: number; column: number; message: string };
      return r.ok ? { ok: true, value: decode(r.value) } : { ok: false, rule: r.rule, line: r.line, column: r.column, message: r.message };
    },
    foldProject(files, host) {
      const r = call({ op: "foldProject", files: Object.fromEntries(files), host: hostDescription(host) }) as { verdicts: Record<string, { kind: "fold"; exports: Record<string, unknown> } | { kind: "run"; rule?: string; reason: string }> };
      const verdicts: Record<string, { kind: "fold"; exports: Record<string, unknown> } | { kind: "run"; rule?: string; reason: string }> = {};
      for (const [path, v] of Object.entries(r.verdicts)) verdicts[path] = v.kind === "fold" ? { kind: "fold", exports: decode(v.exports) as Record<string, unknown> } : v;
      return { verdicts };
    },
    generate(namespace, host) {
      const r = call({ op: "generate", namespace: encode(namespace), host: hostDescription(host) }) as { source?: string; unavailable?: string };
      return r.source ?? "unavailable";
    },
  };
}
