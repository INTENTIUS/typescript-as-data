/**
 * The adapters for `evaluators/rust`, the evaluator with no JavaScript
 * runtime (#86), in its two forms. The binary speaks JSON on stdin and
 * stdout and is spawned per call; the WebAssembly module is the same crate
 * compiled to `wasm32-unknown-unknown`, instantiated once with no imports
 * and called in place through a linear-memory buffer. Both decode the two
 * things JSON cannot carry, `undefined` and a non-finite number, from the
 * tagged objects the evaluator writes. Nothing here folds anything.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConformanceAdapter, ConformanceHost } from "../index.js";

/** The binary, from `TSAD_RUST_EVAL` or the crate's release build; `undefined` when neither exists. */
export function rustEvaluatorPath(root = process.cwd()): string | undefined {
  const env = process.env.TSAD_RUST_EVAL;
  if (env) return existsSync(env) ? env : undefined;
  const built = join(root, "evaluators", "rust", "target", "release", "tsad-eval");
  return existsSync(built) ? built : undefined;
}

/** The WebAssembly module, from `TSAD_RUST_WASM` or the crate's wasm release build; `undefined` when neither exists. */
export function rustWasmPath(root = process.cwd()): string | undefined {
  const env = process.env.TSAD_RUST_WASM;
  if (env) return existsSync(env) ? env : undefined;
  const built = join(root, "evaluators", "rust", "target", "wasm32-unknown-unknown", "release", "tsad_eval.wasm");
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

/** One request in, one answer out, both JSON text: what both transports wrap. */
type Call = (req: Record<string, unknown>) => Record<string, unknown>;

/**
 * The wasm module's calling convention, as `evaluators/rust/src/lib.rs`
 * states it: `tsad_alloc` a request buffer, write the UTF-8 request, call
 * `tsad_eval(ptr, len)`, read a four-byte little-endian length and that many
 * bytes of UTF-8 answer at the returned pointer, and `tsad_free` both. The
 * memory's buffer is re-read on every access because a growth detaches it.
 */
/** The slice of the WebAssembly API this file uses, typed here because the repository compiles without the DOM lib. */
interface WasmApi {
  Module: new (bytes: Uint8Array) => object;
  Instance: new (module: object, imports: object) => { exports: Record<string, unknown> };
  Module_imports?: never;
}
const WA = (globalThis as unknown as { WebAssembly: WasmApi & { Module: { imports(m: object): unknown[] } } }).WebAssembly;

/** How many imports a module declares; the evaluator's is zero, which is what lets it instantiate anywhere. */
export function wasmImportCount(bytes: Uint8Array): number {
  return WA.Module.imports(new WA.Module(bytes)).length;
}

export function wasmCaller(bytes: Uint8Array): Call {
  const instance = new WA.Instance(new WA.Module(bytes), {});
  const ex = instance.exports as {
    memory: { buffer: ArrayBuffer };
    tsad_alloc(len: number): number;
    tsad_free(ptr: number, len: number): void;
    tsad_eval(ptr: number, len: number): number;
  };
  return (req) => {
    const enc = new TextEncoder().encode(JSON.stringify(req));
    const ptr = ex.tsad_alloc(enc.length);
    new Uint8Array(ex.memory.buffer, ptr, enc.length).set(enc);
    const out = ex.tsad_eval(ptr, enc.length);
    ex.tsad_free(ptr, enc.length);
    const len = new DataView(ex.memory.buffer).getUint32(out, true);
    const text = new TextDecoder().decode(new Uint8Array(ex.memory.buffer, out + 4, len));
    ex.tsad_free(out, len + 4);
    const r = JSON.parse(text) as Record<string, unknown>;
    if (r.error) throw new Error(`tsad-eval: ${r.error}`);
    return r;
  };
}

/** The evaluator as a WebAssembly module, instantiated once and called in place: no process, no runtime, no imports. */
export function rustWasmAdapter(wasmPath: string): ConformanceAdapter {
  return adapterOver(wasmCaller(readFileSync(wasmPath)), "wasm");
}

/** The evaluator as a binary, spawned per call over stdin and stdout. */
export function rustAdapter(binary: string): ConformanceAdapter {
  const call: Call = (req) => {
    const out = execFileSync(binary, [], { input: JSON.stringify(req), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const r = JSON.parse(out) as Record<string, unknown>;
    if (r.error) throw new Error(`tsad-eval: ${r.error}`);
    return r;
  };
  return adapterOver(call, "native");
}

function adapterOver(call: Call, transport: "native" | "wasm"): ConformanceAdapter {
  const version = call({ op: "version" }) as { specVersion: string; name: string };
  return {
    name: transport === "wasm" ? `${version.name} (wasm)` : version.name,
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
