/**
 * The checker oracle (#233): a folded value against the type `tsc` gives its
 * export, with nothing executed.
 *
 * Under `full` a folded file is checked against running it. Under
 * `data-host` there is no run path, and the round trip only shows the
 * evaluator agreeing with itself. This module is an independent check that
 * needs neither evaluator: it asks the TypeScript checker what each export
 * is and compares that with what the fold produced.
 *
 * The method, in four steps.
 *
 * 1. Copy the build and force const inference. Every top-level `const`
 *    initializer and every `export default` expression that is plain data is
 *    wrapped in `__tsad_exact(...)`, declared as
 *    `declare function __tsad_exact<const T>(v: T): T`. A `const` type
 *    parameter makes the checker infer the argument as if it were written
 *    `as const`, so `{ target: "es5" }` has the type `{ readonly target: "es5" }`
 *    instead of `{ target: string }`. Without this the checker's type is
 *    widened and almost any fold is assignable to it.
 * 2. Write the folded value as two types: `F`, its literal type with mutable
 *    tuples, and `R`, the same with readonly tuples and, at every node where
 *    the checker has no literal, the checker's own type at that node.
 * 3. Require `F` assignable to the export's type and the export's type
 *    assignable to `R`. Where every node is literal, `F` and `R` are the same
 *    type up to readonly, and mutual assignability of literal types is
 *    equality, so a fold that adds, drops or changes a key fails.
 * 4. Probe every node of the folded value with `__IsExact<At<E, path>>`.
 *    The probe is written so that it errors where the node is a single
 *    literal and is silent otherwise, because a type the checker could not
 *    compute absorbs every conditional over it and never errors. A node is
 *    not exact where the checker's type there is not a single literal:
 *    `string`, `number`, `boolean`, a union, `any` or `unknown`, an array
 *    that is not a tuple, an object with an index signature, optional or
 *    function-valued members (a class instance), `object` or `{}`. A leaf
 *    under such a node is "unchecked", never "pass", and its path is
 *    reported.
 *
 * Everything is decided by public `tsc` diagnostics on emitted files: no
 * checker API. The copy-and-wrap step reads syntax only. So the same batch
 * runs under any compiler that takes a `tsconfig.json` and prints
 * `file(line,col): error TSnnnn: message`, TypeScript 7's native one
 * included; set `TSAD_ORACLE_TSC` to its command.
 *
 * Scope: plain-data exports. An export whose initializer is `new X(...)`, or
 * whose folded value holds anything other than JSON data, `undefined` and
 * non-finite numbers (a live instance, a function, an envelope such as
 * `__intrinsic` or `__compositeStep`), is out of scope. Out of scope is not a
 * failure. A `.d.ts` literal is never used to fold anything here; the oracle
 * only reads the checker's view of the project's own source.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import * as ts from "typescript";
import type { ConformanceAdapter } from "./adapter.js";
import type { Fixture } from "./fixture.js";
import { requireHost } from "./host.js";
import { decodeValue } from "./runner.js";

/** One file's folded exports, in the build it was folded in. */
export interface OracleSubject {
  /** The fixture id, or the corpus entry. Files of one unit are type-checked together. */
  readonly unit: string;
  /** The build, path relative to its root (`/`-separated, `../` allowed) to source. */
  readonly files: ReadonlyMap<string, string>;
  /** The file whose exports are judged. */
  readonly file: string;
  /** Export name to folded value, as the evaluator produced it. */
  readonly exports: Readonly<Record<string, unknown>>;
}

export type OracleVerdict = "pass" | "fail" | "unchecked" | "out-of-scope";

export interface OracleResult {
  readonly unit: string;
  readonly file: string;
  readonly exportName: string;
  readonly verdict: OracleVerdict;
  /** Leaves of the folded value: scalars, `undefined`, and empty arrays and objects. */
  readonly leaves: number;
  /** Leaves on a path where the checker has a literal at every node. */
  readonly checkedLeaves: number;
  /** The topmost paths where the checker has no literal (`$`, `$.a`, `$.xs[0]`, `$["with-dash"]`). */
  readonly uncheckedPaths: readonly string[];
  /** For `fail`, the diagnostics that decided it. */
  readonly diagnostics: readonly string[];
  /** For `out-of-scope`, why. */
  readonly reason?: string;
}

export interface OracleOptions {
  /**
   * The compiler command, argv style. Defaults to `TSAD_ORACLE_TSC` split on
   * spaces, then the `typescript` package's own `tsc` under the running node.
   */
  readonly tsc?: readonly string[];
  /** A `node_modules` the copied builds resolve bare specifiers from (a corpus checkout's). */
  readonly nodeModules?: string;
  /** Keep the emitted batch here instead of a temporary directory, for inspection. */
  readonly workDir?: string;
}

// ── scope ────────────────────────────────────────────────────────────────────

const ENVELOPE_KEYS = new Set(["__intrinsic", "__symbol", "__compositeStep", "__resource", "__attrRef", "__helper"]);

type Seg = string;
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** `$`, then `.name`, `[0]` for an array index, `["other"]`. */
export function renderPath(path: readonly Seg[], arrays: readonly boolean[] = []): string {
  return "$" + path.map((s, i) => (arrays[i] ? `[${s}]` : IDENT.test(s) ? `.${s}` : `[${JSON.stringify(s)}]`)).join("");
}

/** Why a folded value is not plain data, or `undefined` when it is. */
export function notPlainData(v: unknown, path: Seg[] = [], arrays: boolean[] = []): string | undefined {
  if (v === undefined || v === null) return undefined;
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return undefined;
  if (t !== "object") return `a ${t} at ${renderPath(path, arrays)}`;
  if (Array.isArray(v)) {
    if (Object.getPrototypeOf(v) !== Array.prototype) return `a non-plain array at ${renderPath(path, arrays)}`;
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) return `a hole at ${renderPath([...path, String(i)], [...arrays, true])}`;
      const r = notPlainData(v[i], [...path, String(i)], [...arrays, true]);
      if (r) return r;
    }
    return undefined;
  }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return `an instance of ${(v as object).constructor?.name ?? "a class"} at ${renderPath(path, arrays)}`;
  if (Object.getOwnPropertySymbols(v).length) return `a symbol key at ${renderPath(path, arrays)}`;
  for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
    if (ENVELOPE_KEYS.has(k)) return `an envelope (${k}) at ${renderPath(path, arrays)}`;
    const r = notPlainData(e, [...path, k], [...arrays, false]);
    if (r) return r;
  }
  return undefined;
}

const unwrap = (e: ts.Expression): ts.Expression => {
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e)) e = e.expression;
    else return e;
  }
};

/** Whether an initializer is wrapped: data syntax, not a call, a construction or a function. */
function wrappable(e: ts.Expression): boolean {
  const u = unwrap(e);
  return !(
    ts.isCallExpression(u) || ts.isNewExpression(u) || ts.isTaggedTemplateExpression(u) ||
    ts.isArrowFunction(u) || ts.isFunctionExpression(u) || ts.isClassExpression(u) || ts.isAwaitExpression(u)
  );
}

/** The initializer each local export name is bound to, where the file says so directly. */
function exportInitializers(sf: ts.SourceFile): Map<string, ts.Expression> {
  const consts = new Map<string, ts.Expression>();
  const out = new Map<string, ts.Expression>();
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st) && st.declarationList.flags & ts.NodeFlags.Const) {
      const exported = ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        consts.set(d.name.text, d.initializer);
        if (exported) out.set(d.name.text, d.initializer);
      }
    } else if (ts.isExportAssignment(st) && !st.isExportEquals) {
      out.set("default", st.expression);
    }
  }
  for (const st of sf.statements) {
    if (!ts.isExportDeclaration(st) || st.moduleSpecifier || !st.exportClause || !ts.isNamedExports(st.exportClause)) continue;
    for (const el of st.exportClause.elements) {
      const local = (el.propertyName ?? el.name).text;
      const init = consts.get(local);
      if (init) out.set(el.name.text, init);
    }
  }
  return out;
}

/** The copy: plain-data initializers wrapped in `__tsad_exact`, and the declaration appended. */
export function wrapSource(source: string, path = "file.ts"): string {
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const spans: [number, number][] = [];
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st) && st.declarationList.flags & ts.NodeFlags.Const) {
      for (const d of st.declarationList.declarations) if (d.initializer && wrappable(d.initializer)) spans.push([d.initializer.getStart(sf), d.initializer.end]);
    } else if (ts.isExportAssignment(st) && !st.isExportEquals && wrappable(st.expression)) {
      spans.push([st.expression.getStart(sf), st.expression.end]);
    }
  }
  let out = source;
  for (const [s, e] of spans.sort((a, b) => b[0] - a[0])) out = `${out.slice(0, s)}__tsad_exact(${out.slice(s, e)})${out.slice(e)}`;
  // `export {}` keeps a file that exports nothing a module, so the units of a batch never share a global scope.
  return `${out}\nexport {};\ndeclare function __tsad_exact<const T>(v: T): T;\n`;
}

// ── the emitted checks ───────────────────────────────────────────────────────

const PRELUDE = `declare const __tsad_missing: unique symbol;
type __Missing = { readonly [__tsad_missing]: true };
type __IsAny<T> = 0 extends 1 & T ? true : false;
type __IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : false;
type __HasFn<T> = { [K in keyof T]-?: T[K] extends (...a: never[]) => unknown ? K : never }[keyof T];
type __HasOpt<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];
type __IsExact<T> =
  __IsAny<T> extends true ? false :
  [T] extends [never] ? false :
  [T] extends [__Missing] ? true :
  unknown extends T ? false :
  true extends __IsUnion<T> ? false :
  [T] extends [string] ? (string extends T ? false : {} extends Record<T & string, 1> ? false : true) :
  [T] extends [number] ? (number extends T ? false : true) :
  [T] extends [bigint] ? (bigint extends T ? false : true) :
  [T] extends [boolean] ? true :
  [T] extends [null] ? true :
  [T] extends [undefined] ? true :
  [T] extends [symbol] ? false :
  [T] extends [(...a: never[]) => unknown] ? false :
  [T] extends [readonly unknown[]] ? (number extends T["length"] ? false : true) :
  [T] extends [object] ? (string extends keyof T ? false : number extends keyof T ? false : [object] extends [T] ? false :
    [__HasFn<T>] extends [never] ? ([__HasOpt<T>] extends [never] ? true : false) : false) :
  false;
type __Step<T, K extends string> =
  T extends readonly unknown[]
    ? (number extends T["length"] ? T[number] : T extends { readonly [P in K]: infer V } ? V : __Missing)
    : T extends { readonly [P in K]: infer V } ? V
    : string extends keyof T ? T[string & keyof T] : __Missing;
type __At<T, P extends readonly string[]> = P extends readonly [infer K extends string, ...infer R extends readonly string[]] ? __At<__Step<T, K>, R> : T;
type __Or<T, L> = __IsExact<T> extends true ? L : T;
type __Probe<T> = __IsExact<T> extends true ? false : true;`;

interface Node { path: Seg[]; arrays: boolean[]; leaf: boolean }

/** Every node of a plain-data value, root first. */
function nodesOf(v: unknown, path: Seg[] = [], arrays: boolean[] = [], out: Node[] = []): Node[] {
  if (Array.isArray(v)) {
    out.push({ path, arrays, leaf: v.length === 0 });
    v.forEach((e, i) => nodesOf(e, [...path, String(i)], [...arrays, true], out));
  } else if (v !== null && typeof v === "object") {
    const entries = Object.entries(v);
    out.push({ path, arrays, leaf: entries.length === 0 });
    for (const [k, e] of entries) nodesOf(e, [...path, k], [...arrays, false], out);
  } else out.push({ path, arrays, leaf: true });
  return out;
}

const scalarType = (v: unknown): string =>
  v === undefined ? "undefined" : v === null ? "null" : typeof v === "number" ? (Number.isFinite(v) ? (Object.is(v, -0) ? "0" : String(v)) : "number") : JSON.stringify(v);

const tuple = (path: readonly Seg[]) => `[${path.map((s) => JSON.stringify(s)).join(", ")}]`;

/** `F`: the folded value's literal type, tuples mutable so it is assignable to an array type too. */
function forwardType(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(forwardType).join(", ")}]`;
  if (v !== null && typeof v === "object") return `{ ${Object.entries(v).map(([k, e]) => `${JSON.stringify(k)}: ${forwardType(e)}`).join("; ")} }`;
  return scalarType(v);
}

/** `R`: the same, readonly, with the checker's own type standing in wherever it has no literal. */
function reverseType(v: unknown, e: string, path: Seg[] = []): string {
  let lit: string;
  if (Array.isArray(v)) lit = `readonly [${v.map((x, i) => reverseType(x, e, [...path, String(i)])).join(", ")}]`;
  else if (v !== null && typeof v === "object") lit = `{ ${Object.entries(v).map(([k, x]) => `readonly ${JSON.stringify(k)}: ${reverseType(x, e, [...path, k])}`).join("; ")} }`;
  else lit = scalarType(v);
  return `__Or<__At<${e}, ${tuple(path)}>, ${lit}>`;
}

interface Pending {
  subject: OracleSubject;
  exportName: string;
  nodes: Node[];
  /** Lines of the oracle file: the preamble, the two directions, and one probe per node. */
  preambleLines: number[];
  forwardLine: number;
  reverseLine: number;
  probeLines: number[];
}

const PROBE_EXACT = "TS2322: Type 'true' is not assignable to type 'false'.";
const DIAG = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

function tscCommand(opt: OracleOptions): string[] {
  if (opt.tsc?.length) return [...opt.tsc];
  const env = process.env.TSAD_ORACLE_TSC?.trim();
  if (env) return env.split(/\s+/);
  const require = createRequire(import.meta.url);
  return [process.execPath, require.resolve("typescript/bin/tsc")];
}

const stripTs = (p: string) => p.replace(/\.(d\.)?[cm]?tsx?$/, "");

/** Run the oracle over a batch. One `tsc` invocation for the whole batch. */
export function runOracle(subjects: readonly OracleSubject[], opt: OracleOptions = {}): OracleResult[] {
  const results: OracleResult[] = [];
  const base = (s: OracleSubject, exportName: string) => ({ unit: s.unit, file: s.file, exportName });

  // Scope first: nothing out of scope reaches the compiler.
  const inScope: { subject: OracleSubject; exportName: string; value: unknown }[] = [];
  for (const s of subjects) {
    const src = s.files.get(s.file);
    const inits = src ? exportInitializers(ts.createSourceFile(s.file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)) : new Map<string, ts.Expression>();
    for (const [exportName, value] of Object.entries(s.exports)) {
      const init = inits.get(exportName);
      const reason = init && ts.isNewExpression(unwrap(init)) ? "constructs with new" : notPlainData(value);
      if (reason) results.push({ ...base(s, exportName), verdict: "out-of-scope", leaves: 0, checkedLeaves: 0, uncheckedPaths: [], diagnostics: [], reason });
      else inScope.push({ subject: s, exportName, value });
    }
  }
  if (!inScope.length) return results;

  const work = opt.workDir ?? mkdtempSync(join(tmpdir(), "tsad-oracle-"));
  mkdirSync(work, { recursive: true });
  try {
    const units = new Map<string, OracleSubject[]>();
    for (const x of inScope) {
      const list = units.get(x.subject.unit) ?? [];
      if (!list.includes(x.subject)) list.push(x.subject);
      units.set(x.subject.unit, list);
    }
    const pending: Pending[] = [];
    const oracleFiles = new Map<string, Pending[]>();
    let u = 0;
    for (const [, unitSubjects] of units) {
      const unitDir = `u${u++}`;
      const files = unitSubjects[0].files;
      // A key that climbs out of the build's root (`../lib/x.ts`) lands inside the unit all the same.
      const depth = Math.max(0, ...[...files.keys()].map((k) => k.split("/").findIndex((s) => s !== "..")));
      const root = posix.join(unitDir, ...Array<string>(depth).fill("_"));
      for (const [key, src] of files) {
        const abs = join(work, root, key);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, wrapSource(src, key));
      }
      const lines: string[] = PRELUDE.split("\n");
      const push = (l: string) => { lines.push(l); return lines.length; };
      const mine: Pending[] = [];
      let i = 0;
      for (const s of unitSubjects) {
        const spec = "./" + stripTs(s.file);
        for (const x of inScope.filter((x) => x.subject === s)) {
          const n = i++;
          const E = `__E${n}`;
          const preambleLines = [push(`type ${E} = (typeof import(${JSON.stringify(spec)}))[${JSON.stringify(x.exportName)}];`)];
          preambleLines.push(push(`declare const __f${n}: ${forwardType(x.value)};`));
          const forwardLine = push(`const __cf${n}: ${E} = __f${n};`);
          preambleLines.push(push(`declare const __e${n}: ${E};`));
          const reverseLine = push(`const __cr${n}: ${reverseType(x.value, E)} = __e${n};`);
          const nodes = nodesOf(x.value);
          const probeLines = nodes.map((nd) => push(`const __p${n}_${lines.length}: __Probe<__At<${E}, ${tuple(nd.path)}>> = true;`));
          const p: Pending = { subject: s, exportName: x.exportName, nodes, preambleLines, forwardLine, reverseLine, probeLines };
          mine.push(p);
          pending.push(p);
        }
      }
      push("export {};");
      const oracleFile = posix.join(root, "__tsad_oracle.ts");
      writeFileSync(join(work, oracleFile), lines.join("\n") + "\n");
      oracleFiles.set(oracleFile, mine);
    }
    const compilerOptions = {
      strict: true, noEmit: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", lib: ["ES2022"], types: [],
      skipLibCheck: true, resolveJsonModule: true, allowImportingTsExtensions: true, noErrorTruncation: true,
    };
    writeFileSync(join(work, "tsconfig.json"), JSON.stringify({ compilerOptions, include: ["**/*.ts"], exclude: ["node_modules"] }, null, 2));
    if (opt.nodeModules) symlinkSync(opt.nodeModules, join(work, "node_modules"), "dir");

    const [cmd, ...args] = tscCommand(opt);
    const run = spawnSync(cmd, [...args, "-p", "tsconfig.json", "--pretty", "false"], { cwd: work, encoding: "utf8", maxBuffer: 1 << 28 });
    if (run.error) throw run.error;
    // Diagnostics in the copied sources are the sources' own business; only the oracle files decide anything.
    const byFile = new Map<string, Map<number, string[]>>();
    let last: string[] | undefined;
    for (const line of (run.stdout ?? "").split("\n")) {
      const m = DIAG.exec(line);
      if (!m) { if (last && line.startsWith(" ")) last[last.length - 1] += "\n" + line; continue; }
      const file = m[1].split("\\").join("/");
      if (!oracleFiles.has(file)) { last = undefined; continue; }
      const at = byFile.get(file) ?? new Map<number, string[]>();
      byFile.set(file, at);
      const list = at.get(Number(m[2])) ?? [];
      list.push(`${m[4]}: ${m[5]}`);
      at.set(Number(m[2]), list);
      last = list;
    }
    if (run.status !== 0 && byFile.size === 0 && !/error TS/.test(run.stdout ?? "")) {
      throw new Error(`tsc failed without diagnostics (status ${run.status}): ${run.stderr || run.stdout}`);
    }
    for (const [file, list] of oracleFiles) {
      const at = byFile.get(file) ?? new Map<number, string[]>();
      for (const p of list) {
        const diagnostics = [...p.preambleLines, p.forwardLine, p.reverseLine].flatMap((l) => at.get(l) ?? []);
        // Inverted on purpose: the probe errors where the node IS exact. A
        // type the checker could not compute (an unresolved name, a missing
        // property) is an error type, every conditional over it is an error
        // type too, and an assignment to one never errors, so it reads as
        // not exact instead of slipping through as a pass.
        const exact = p.probeLines.map((l) => (at.get(l) ?? []).some((d) => d === PROBE_EXACT));
        const key = (nd: Node) => nd.path.join("\u0000");
        const exactByPath = new Map(p.nodes.map((nd, i) => [key(nd), exact[i]]));
        let leaves = 0, checkedLeaves = 0;
        const unchecked: string[] = [];
        for (const nd of p.nodes) {
          const ancestorsExact = nd.path.every((_, j) => exactByPath.get(nd.path.slice(0, j).join("\u0000")) !== false);
          if (!exactByPath.get(key(nd)) && ancestorsExact) unchecked.push(renderPath(nd.path, nd.arrays));
          if (!nd.leaf) continue;
          leaves++;
          if (ancestorsExact && exactByPath.get(key(nd))) checkedLeaves++;
        }
        const verdict: OracleVerdict = diagnostics.length ? "fail" : unchecked.length ? "unchecked" : "pass";
        results.push({ ...base(p.subject, p.exportName), verdict, leaves, checkedLeaves, uncheckedPaths: unchecked, diagnostics });
      }
    }
  } finally {
    if (!opt.workDir) rmSync(work, { recursive: true, force: true });
  }
  return results;
}

// ── over the fixtures ────────────────────────────────────────────────────────

/** The parts of an adapter the oracle reads folds from. */
export type OracleAdapter = Pick<ConformanceAdapter, "foldExport" | "foldProject" | "generate">;

/**
 * The fixtures of the `data-host` profile, folded by `adapter`, as subjects.
 * Files the adapter does not fold are not subjects: the oracle judges folds.
 */
export async function fixtureSubjects(adapter: OracleAdapter, fixtures: readonly Fixture[]): Promise<OracleSubject[]> {
  const out: OracleSubject[] = [];
  for (const f of fixtures) {
    if (!f.profiles.includes("data-host")) continue;
    const host = "host" in f && f.host ? requireHost(f.host) : undefined;
    if (f.kind === "expression") {
      if (f.fold !== "fold") continue;
      const r = adapter.foldExport(f.input, f.exportName);
      if (r.ok) out.push({ unit: f.id, files: new Map([["input.ts", f.input]]), file: "input.ts", exports: { [f.exportName]: r.value } });
    } else if (f.kind === "project") {
      if (!adapter.foldProject) continue;
      const r = await adapter.foldProject(f.files, host, f.mode);
      if (r === "unavailable") continue;
      for (const [file, v] of Object.entries(r.verdicts)) if (v.kind === "fold") out.push({ unit: f.id, files: f.files, file, exports: v.exports });
    } else {
      if (!adapter.generate || !adapter.foldProject) continue;
      const src = adapter.generate(decodeValue(f.value) as Record<string, unknown>, host);
      if (src === "unavailable") continue;
      const files = new Map([["generated.ts", src]]);
      const r = await adapter.foldProject(files, host);
      if (r === "unavailable") continue;
      const v = r.verdicts["generated.ts"];
      if (v?.kind === "fold") out.push({ unit: f.id, files, file: "generated.ts", exports: v.exports });
    }
  }
  return out;
}

/**
 * Failures the oracle is right to report, keyed `<unit>:<file>#<export>`,
 * each with its reason. A lying assertion (`"es5" as unknown as "esnext"`)
 * folds to its operand by S-Unwrap, and the checker believes the assertion,
 * so the two disagree by design; a fixture that uses one belongs here.
 * Anything not listed is an evaluator bug or an oracle bug.
 *
 * Empty: no fixture in `spec/fixtures/` asserts a lie today. The only
 * assertion among the data-host fixtures, `S-Unwrap/as-and-parens`, widens
 * to `string` and so is unchecked rather than failed.
 */
export const EXPECTED_FAILURES: Readonly<Record<string, string>> = {};

export const resultKey = (r: Pick<OracleResult, "unit" | "file" | "exportName">) => `${r.unit}:${r.file}#${r.exportName}`;

export interface OracleSummary {
  readonly exports: number;
  readonly outOfScope: number;
  readonly pass: number;
  readonly unchecked: number;
  readonly failExpected: number;
  readonly failUnexpected: readonly OracleResult[];
  /** Listed expected failures that did not fail, or were not seen at all; the list should drop them. */
  readonly expectedButPassed: readonly string[];
  readonly leaves: number;
  readonly checkedLeaves: number;
}

export function summarizeOracle(results: readonly OracleResult[], expected: Readonly<Record<string, string>> = EXPECTED_FAILURES): OracleSummary {
  const fails = results.filter((r) => r.verdict === "fail");
  const failing = new Set(fails.map(resultKey));
  const inScope = results.filter((r) => r.verdict !== "out-of-scope");
  return {
    exports: results.length,
    outOfScope: results.length - inScope.length,
    pass: results.filter((r) => r.verdict === "pass").length,
    unchecked: results.filter((r) => r.verdict === "unchecked").length,
    failExpected: fails.filter((r) => expected[resultKey(r)]).length,
    failUnexpected: fails.filter((r) => !expected[resultKey(r)]),
    expectedButPassed: Object.keys(expected).filter((k) => !failing.has(k)),
    leaves: inScope.reduce((n, r) => n + r.leaves, 0),
    checkedLeaves: inScope.reduce((n, r) => n + r.checkedLeaves, 0),
  };
}
