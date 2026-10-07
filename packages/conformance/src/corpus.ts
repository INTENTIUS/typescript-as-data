/**
 * #25 — the whole corpus against both implementations.
 *
 * The fixtures in `spec/fixtures/` were written to exercise particular rules,
 * so agreement on them is agreement on cases somebody chose. chant's example
 * corpus was not written for this purpose at all, which is the only reason
 * running it is worth anything.
 *
 * The corpus lives in a chant checkout, not in this repository and not in the
 * published package, so this module is inert without one: point
 * `TSAD_CHANT_REPO` at a checkout whose dependencies are installed. There is
 * no default on purpose. A sibling checkout on a developer's machine is at
 * whatever commit they last pulled, and a gate that reads a moving corpus
 * fails for reasons that have nothing to do with the change under test; the
 * number the paper cites is taken at the pinned tag. The enumeration is chant's own
 * `examples/differential-corpus.ts` — the same list, lexicon selection and
 * intrinsic wiring its own differentials use, imported rather than
 * reimplemented, so a corpus entry added or a network fixture excluded there
 * is picked up here without an edit.
 *
 * What a difference between the two implementations is allowed to mean is
 * `classify`'s subject, below, and it is most of this file.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { foldProject as chantFoldProject } from "@intentius/chant";
import { findInfraFiles } from "@intentius/chant/discovery/files";
import { FOLDABLE_AUTHORING_HELPERS, isChantOwnedSpecifier } from "@intentius/chant/fold/foldable-helpers";
import { foldProject as referenceFoldProject, findFactoryViolation, type Host } from "@intentius/tsad-reference";
import type { ConformanceAdapter } from "./adapter.js";
import type { ConformanceHost } from "./host.js";
import { rustAdapter, rustEvaluatorPath } from "./adapters/rust.js";
import { runOracle, summarizeOracle, type OracleOptions, type OracleResult, type OracleSubject } from "./oracle.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** An intrinsic registration, as chant's lexicon plugins publish it (F-Host-Registry). */
interface ChantIntrinsic {
  readonly name: string;
  readonly isTag: boolean;
  readonly foldsAsCall?: boolean;
  readonly foldsEagerly?: boolean;
  readonly outputKey?: string;
}

/** One buildable source directory, as chant's own corpus discovery reports it. */
export interface CorpusEntry {
  readonly name: string;
  readonly srcDir: string;
  /** The intrinsic registry this entry builds with, from the lexicons its own config declares. */
  readonly intrinsics: readonly ChantIntrinsic[];
  /** The lexicon names the entry's own config declares: F-Host-Trust arm 1's active set, which chant's entry takes since chant#2422. */
  readonly lexicons: readonly string[];
  /** The entry's build parameters, resolved the way the CLI resolves them, so a file reading `params.<name>` folds on chant's side. */
  readonly buildParams: Readonly<Record<string, string | number | boolean>>;
  /** Directories under `srcDir` that are entries of their own (a nested `chant.config.ts`), so no file is counted twice. */
  readonly exclude?: readonly string[];
}

export interface ChantCheckout {
  readonly root: string;
  /** The checkout's own chant version, which need not be the pinned one this runs against. */
  readonly corpusVersion: string;
  /** The commit the corpus was read at, and whether the tree had uncommitted changes. A number is only reproducible against a clean, named revision. */
  readonly revision: string;
}

/** The checkout `TSAD_CHANT_REPO` names, or `undefined` when it is unset or names nothing readable. */
export function findChantCheckout(): ChantCheckout | undefined {
  if (!process.env.TSAD_CHANT_REPO) return undefined;
  const root = resolve(REPO_ROOT, process.env.TSAD_CHANT_REPO);
  if (!existsSync(resolve(root, "examples", "differential-corpus.ts"))) return undefined;
  const manifest = resolve(root, "packages", "core", "package.json");
  const corpusVersion = existsSync(manifest)
    ? ((JSON.parse(readFileSync(manifest, "utf8")) as { version?: string }).version ?? "unknown")
    : "unknown";
  let revision = "unknown";
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    // Tracked files only: a seeded worktree carries untracked generated
    // artifacts and a `node_modules` link, neither of which is corpus source.
    const dirty = git("status", "--porcelain", "--untracked-files=no").length > 0;
    revision = `${git("rev-parse", "--short", "HEAD")}${dirty ? " (dirty)" : ""}`;
  } catch {
    // Not a git checkout, or no git: the report says so rather than guessing.
  }
  return { root, corpusVersion, revision };
}

/**
 * chant's corpus, from chant's own discovery. The import is dynamic and by
 * absolute path because the file is not a module of this project: it imports
 * eleven lexicon packages, which resolve from the checkout's own
 * `node_modules`. A checkout whose dependencies are not installed cannot
 * answer at all, and the import throws rather than producing a shorter corpus.
 */
export async function discoverCorpus(checkout: ChantCheckout): Promise<CorpusEntry[]> {
  const mod = (await import(/* @vite-ignore */ resolve(checkout.root, "examples", "differential-corpus.ts"))) as {
    discoverCorpus(): Promise<{ name: string; srcDir: string; intrinsics: readonly ChantIntrinsic[]; lexicons: readonly string[] }[]>;
    entryBuildParams(entry: unknown): Promise<readonly { name: string; value: string | number | boolean }[]>;
  };
  const entries = await mod.discoverCorpus();
  return Promise.all(
    entries.map(async (e) => ({
      name: e.name,
      srcDir: e.srcDir,
      intrinsics: e.intrinsics,
      lexicons: e.lexicons,
      buildParams: Object.fromEntries((await mod.entryBuildParams(e)).map((p) => [p.name, p.value])),
    })),
  );
}

// ── codebases nobody here maintains (#129) ──────────────────────────────────

/** One checkout from `corpus-external.json`, and what is on disk for it. */
export interface ExternalCheckout {
  readonly name: string;
  readonly repo: string;
  /** The revision the manifest pins. */
  readonly rev: string;
  readonly note?: string;
  /** Disagreements triaged to an issue, by entry-relative file: excused from agreement by name and asserted to persist, so an excuse cannot outlive its cause. */
  readonly disagreements?: Readonly<Record<string, string>>;
  readonly root: string;
  /** The revision on disk, or `missing` when the checkout is absent. */
  readonly headRevision: string;
}

const EXTERNAL_MANIFEST = resolve(REPO_ROOT, "packages", "conformance", "corpus-external.json");

/**
 * The external checkouts `TSAD_CORPUS_EXTERNAL` holds, one per manifest
 * entry, or `undefined` when the variable is unset. A missing checkout is
 * returned with `headRevision: "missing"` rather than dropped, so the test
 * can say which one `scripts/fetch-corpus-external.sh` has to fetch.
 */
export function findExternalCheckouts(): ExternalCheckout[] | undefined {
  if (!process.env.TSAD_CORPUS_EXTERNAL) return undefined;
  const dir = resolve(REPO_ROOT, process.env.TSAD_CORPUS_EXTERNAL);
  const manifest = JSON.parse(readFileSync(EXTERNAL_MANIFEST, "utf8")) as { checkouts: Omit<ExternalCheckout, "root" | "headRevision">[] };
  return manifest.checkouts.map((c) => {
    const root = resolve(dir, c.name);
    let headRevision = "missing";
    try { headRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { /* absent */ }
    return { ...c, root, headRevision };
  });
}

/**
 * Every directory in an external checkout that holds a `chant.config.ts` is
 * one entry, the way `chant build` would scope it: its source directory is
 * the config's `sourceDir`, else `src/`, else the directory itself. Lexicons
 * come from the project's own config through chant's resolver, the intrinsic
 * registry from the chant checkout's tables for those lexicons, and the build
 * parameters the way the CLI resolves them, so both implementations see the
 * host a real build of that project would have at the pinned chant.
 */
export async function discoverExternal(checkout: ChantCheckout, ext: ExternalCheckout): Promise<CorpusEntry[]> {
  const mod = (await import(/* @vite-ignore */ resolve(checkout.root, "examples", "differential-corpus.ts"))) as {
    INTRINSICS_BY_LEXICON: Record<string, readonly ChantIntrinsic[]>;
    entryBuildParams(entry: unknown): Promise<readonly { name: string; value: string | number | boolean }[]>;
  };
  const { resolveProjectLexicons } = await import("@intentius/chant/cli");
  const { loadChantConfigUpward } = await import("@intentius/chant/config");
  const dirs: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = resolve(d, e.name);
      if (existsSync(resolve(p, "chant.config.ts"))) dirs.push(p);
      walk(p);
    }
  };
  if (existsSync(resolve(ext.root, "chant.config.ts"))) dirs.push(ext.root);
  walk(ext.root);
  const scoped: { dir: string; srcDir: string }[] = [];
  for (const dir of dirs.sort()) {
    const { config } = (await loadChantConfigUpward(dir)) as { config: { sourceDir?: string } };
    const candidates = [config.sourceDir ? resolve(dir, config.sourceDir) : undefined, resolve(dir, "src"), dir].filter((c): c is string => !!c && existsSync(c));
    scoped.push({ dir, srcDir: candidates[0] });
  }
  const entries: CorpusEntry[] = [];
  for (const { dir, srcDir } of scoped) {
    const lexicons = await resolveProjectLexicons(srcDir);
    const rel = relative(ext.root, dir).split("\\").join("/");
    const exclude = scoped.filter((o) => o.srcDir !== srcDir && o.srcDir.startsWith(srcDir + "/")).map((o) => o.srcDir);
    const base = { name: `${ext.name}/${rel || "."}`, srcDir, intrinsics: lexicons.flatMap((n) => mod.INTRINSICS_BY_LEXICON[n] ?? []), lexicons, exclude };
    const buildParams = Object.fromEntries((await mod.entryBuildParams({ ...base, buildParams: {} })).map((p) => [p.name, p.value]));
    entries.push({ ...base, buildParams });
  }
  return entries;
}

// ── the host ────────────────────────────────────────────────────────────────

/**
 * chant's host, in the reference's terms (F-Host-Interface).
 *
 * Assembled from chant's own registries rather than transcribed: the
 * authoring-helper allowlist and the owned-specifier test come from chant,
 * and the intrinsic registry is the entry's own, so the host the reference
 * folds against is the host chant folds against. A transcription would make
 * the cross-check a test of the transcription.
 *
 * `values` holds the REAL module exports for every host-owned specifier the
 * entry imports, which is what lets revival construct entities (F-Val-Fate).
 * A specifier whose module will not load is reported, not skipped silently:
 * every file that imports it is host-limited, and the count has to show it.
 */
/**
 * The third column (#86): the evaluator with no JavaScript runtime, judged in
 * `data-host` against the reference judged in the same profile with the same
 * host description. Present when the binary is built; the column is omitted
 * from the report otherwise, never silently empty.
 */
const rust: ConformanceAdapter | undefined = (() => { const p = rustEvaluatorPath(REPO_ROOT); return p ? rustAdapter(p) : undefined; })();
export const dataHostEvaluator = rust ? { name: rust.name, specVersion: rust.specVersion } : undefined;

export interface CorpusHost extends Host {
  /** Host-owned specifiers whose module could not be loaded. */
  readonly unloadable: ReadonlySet<string>;
}

async function buildHost(checkout: ChantCheckout, entry: CorpusEntry, sources: ReadonlyMap<string, string>): Promise<CorpusHost> {
  const require = createRequire(resolve(checkout.root, "package.json"));
  const values = new Map<string, ReadonlyMap<string, unknown>>();
  const unloadable = new Set<string>();
  const specifiers = new Set<string>();
  for (const [path, source] of sources) for (const s of specifiersOf(source, path).bare) if (isChantOwnedSpecifier(s)) specifiers.add(s);
  for (const specifier of specifiers) {
    try {
      const mod = (await import(/* @vite-ignore */ require.resolve(specifier))) as Record<string, unknown>;
      values.set(specifier, new Map(Object.entries(mod)));
    } catch {
      unloadable.add(specifier);
    }
  }
  // F-Import's first arm: `params` is the build's binding, not the module's
  // live export. chant substitutes the resolved parameters at fold time; the
  // reference is handed the same values through the host.
  if (specifiers.has("@intentius/chant/params")) {
    values.set("@intentius/chant/params", new Map([["params", entry.buildParams]]));
  }
  return {
    intrinsics: entry.intrinsics,
    helpers: FOLDABLE_AUTHORING_HELPERS,
    // chant's own `CHANT_PACKAGE_SPECIFIERS`, which is private; the predicate
    // over it is not, and the two prefixes are its whole content.
    ownedSpecifierPrefixes: ["@intentius/chant", "@intentius/chant-lexicon-"],
    values,
    unloadable,
  };
}

// ── what a difference between the two implementations can mean ──────────────

export type Side = "fold" | "run";

/**
 * Why a file's two verdicts cannot be compared, or `undefined` when they can.
 *
 * These are the three ways the comparison is disarmed before it starts, and
 * naming them is the point of #25. None of them is drift, and reporting one
 * as drift would be a lie in the direction that flatters the specification.
 */
export type Limit =
  /** The reference has no bindings for a package it cannot load (#20 is not finished). */
  | "host"
  /**
   * A declarator calls a project export that is neither a function the file
   * declares (F-Call step 2, folded or refused by F-Eval-CallLocal) nor an
   * interpretable composite (step 4): a `Composite(fn, …)` whose factory is
   * outside S-FactoryBody, or a const holding a value made at run time. In
   * open mode step 6 imports the module and invokes it, which chant does and
   * the reference never does (`packages/reference/CAVEATS.md`). Decided from
   * syntax: the export's declaration in the file the import names (#129).
   */
  | "invocation";

/**
 * Both limits disarm the reference, and a limit can only make its own side
 * refuse more. Two chant-side limits used to sit here, for a lexicon list and
 * build parameters chant's entry could not be given; chant-v0.71.0 takes both
 * (chant#2422) and they are gone (#96). `invocation` arrived with the first
 * codebase nobody here maintains (#129); chant's own examples never hit it.
 */
export const LIMIT_SIDE: Readonly<Record<Limit, "reference">> = { host: "reference", invocation: "reference" };

/** The data-host column of one file: the reference and the Rust evaluator, both in `data-host`. */
export interface DataHostComparison {
  reference: Side;
  rust: Side;
  agreed: boolean;
  diff?: string;
}

/** What `F-IsolatedRefusal` turned away, as chant names it. */
export type IsolationRefusal = "factory" | "constructor" | "import" | "other";

/**
 * chant builds its refusal as `<what> "<name>" is imported from ...`, with
 * `what` one of "composite factory", "constructor" or "import"
 * (`sandboxedExecutionRefusal`). Anything else is `other` rather than guessed
 * at, so a wording change upstream shows as an unclassified bucket instead of
 * silently landing in the wrong one.
 */
export function isolationRefusalOf(reason: string | undefined): IsolationRefusal | undefined {
  if (!reason) return undefined;
  if (/\bcomposite factory\b/.test(reason)) return "factory";
  if (/\bconstructor\b/.test(reason)) return "constructor";
  if (/\bimport\b\s+"/.test(reason)) return "import";
  return "other";
}

export interface FileComparison {
  readonly file: string;
  readonly chant: Side;
  readonly reference: Side;
  /** The first limit that applies, for the comparable-set accounting. */
  readonly limit?: Limit;
  /** The data-host column, when the evaluator with no JavaScript runtime was present (#86). */
  readonly dataHost?: DataHostComparison;
  /**
   * chant's verdict under `ι = isolated` (#171). `undefined` where the entry's
   * isolated fold could not be taken at all, which is counted apart rather
   * than read as a refusal.
   */
  readonly chantIsolated?: Side;
  /** Why the isolated fold refused, when it did, in the implementation's own words. */
  readonly chantIsolatedReason?: string;
  /**
   * What isolation refused, from the reason (#171). chant names three kinds and
   * they answer different questions: `factory` is F-Call step 6, which spec 2.0
   * refuses outside `executing` in every mode, so that bucket is the cost of
   * #169 rather than of isolation and goes to zero once chant implements #199.
   * `constructor` is F-Val-Fate revival and `import` is a binding neither
   * chant's own nor an active lexicon; those two are isolation's own cost.
   */
  readonly chantIsolatedRefusal?: IsolationRefusal;
  /**
   * The provenance column (#237): every field this file's entities emit, by
   * origin kind. `fold` is chant's `foldProject` record for a file it folded;
   * `build` is what a real build records for a file that runs, from chant's
   * own `discover` and `foldProvenanceOfEntities`. Absent when there is no
   * record: a chant without provenance, a fold whose entities could not be
   * collected, or a run file whose entry could not be built.
   */
  readonly origins?: FileOrigins;
  /** For a run file with no `origins`: why the build that would attribute it could not be taken. */
  readonly originsUnavailable?: string;
  /** Both folded, and their export namespaces were compared as data. */
  readonly values?: "equal" | "differ" | "not-data";
  /** Where the two encodings first differ, with a little context either side, so a difference is a diff and not a verdict. */
  readonly valuesDiff?: string;
  readonly referenceRule?: string;
  readonly referenceReason?: string;
  readonly chantReason?: string;
  /**
   * The checker column (#233): each export of a file the reference folded,
   * against the type `tsc` gives it. Set by `addOracleColumn`, which runs
   * the whole corpus as one batch; absent on a file the reference did not
   * fold.
   */
  readonly oracle?: readonly OracleResult[];
}

export interface EntryReport {
  readonly name: string;
  readonly files: number;
  readonly comparisons: readonly FileComparison[];
  /** Why this entry's isolated fold could not be taken, when it could not (#171). */
  readonly isolatedUnavailableReason?: string;
  /** What the checker column reads: the build's sources and the reference's folds, by file. Not rendered. */
  readonly oracleInput?: { readonly sources: ReadonlyMap<string, string>; readonly folds: ReadonlyMap<string, Readonly<Record<string, unknown>>> };
}

const isProjectSpecifier = (s: string) => s.startsWith(".") || s.startsWith("/");

/** Every specifier a file imports or re-exports for its values, split by kind. */
function specifiersOf(source: string, path: string): { bare: string[]; project: string[] } {
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const bare: string[] = [];
  const project: string[] = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      if (!st.importClause || st.importClause.isTypeOnly) continue;
    } else if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly || !st.moduleSpecifier) continue;
    } else continue;
    const spec = st.moduleSpecifier;
    if (!spec || !ts.isStringLiteral(spec)) continue;
    (isProjectSpecifier(spec.text) ? project : bare).push(spec.text);
  }
  return { bare, project };
}

/** The names a file binds by importing from a host-owned specifier. */
function hostBoundNames(source: string, path: string, host: CorpusHost): Set<string> {
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!host.values.has(st.moduleSpecifier.text)) continue;
    const clause = st.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (clause.name) names.add(clause.name.text);
    const nb = clause.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) names.add(nb.name.text);
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (!el.isTypeOnly) names.add(el.name.text);
  }
  return names;
}

/**
 * True when the file calls a host-owned binding that is neither a registered
 * intrinsic nor a registered authoring helper — the composite factory form.
 *
 * Decided from syntax and the import table, never from a rejection message:
 * message wording is explicitly non-normative, and a classifier that reads it
 * would silently stop classifying the day the wording changed.
 */
/** The reference's own resolution: a relative specifier against the project's key set. */
function resolveKey(from: string, spec: string, keys: ReadonlySet<string>): string | undefined {
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const joined = posix.normalize(base + spec).replace(/^\.\//, "");
  for (const cand of [joined, `${joined}.ts`, `${joined}/index.ts`]) if (keys.has(cand)) return cand;
  return undefined;
}

/**
 * Spread one limit from the files that have it to the files that inherit it.
 *
 * Two propagation rules, matching the two ways a file's condition reaches
 * another file. `F-Import`: a file that imports an unfoldable module cannot
 * resolve what it imported, so an importer of a limited file is limited.
 * `F-Taint`: J3's edge, taken from the reference's own reported `taintSource`
 * rather than recomputed, so this walk cannot disagree with the walk it is
 * classifying.
 *
 * This over-approximates: a file may be in a limited set and also have a real
 * disagreement hiding under it. That is the cost of the limit, and it is what
 * bounds the whole measurement — the comparable set is the part of the corpus
 * the cross-check can speak about.
 */
function spread(
  seed: Set<string>,
  sources: ReadonlyMap<string, string>,
  taintSource: ReadonlyMap<string, string>,
): Set<string> {
  const keys = new Set(sources.keys());
  const importers = new Map<string, string[]>();
  for (const [key, source] of sources) {
    for (const s of specifiersOf(source, key).project) {
      const target = resolveKey(key, s, keys);
      if (target) importers.set(target, [...(importers.get(target) ?? []), key]);
    }
  }
  const taintedBy = new Map<string, string[]>();
  for (const [file, from] of taintSource) taintedBy.set(from, [...(taintedBy.get(from) ?? []), file]);

  const out = new Set(seed);
  const queue = [...seed];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of [...(importers.get(current) ?? []), ...(taintedBy.get(current) ?? [])]) {
      if (out.has(next)) continue;
      out.add(next);
      queue.push(next);
    }
  }
  return out;
}

/**
 * Structural equality over two export namespaces.
 *
 * Entities are compared rather than skipped, which is only sound because both
 * implementations construct them from the SAME host classes: the reference is
 * handed the lexicon packages' real exports, so a `Bucket` on one side and a
 * `Bucket` on the other are instances of one class, and comparing the class
 * name and the data properties compares two folds rather than two hosts. Own
 * data properties only, enumerable or not, accessors skipped: an accessor can
 * throw (chant's `AttrRef.toJSON` does, for a reference whose logical name is
 * not yet assigned) and computes a value rather than holding one.
 *
 * `not-data` is reserved for a namespace holding something with no structural
 * encoding at all, a function or a symbol, where only the verdict can be
 * compared.
 */
function compareData(a: unknown, b: unknown): { values: "equal" | "differ" | "not-data"; valuesDiff?: string } {
  const encode = (v: unknown): string | undefined => {
    // Ancestors on the current path, not everything seen: an object reached
    // twice by different paths is shared, not cyclic, and F-Memo makes sharing
    // the normal case. Marking it would report a difference between an
    // implementation that shares and one that copies, which is not a value
    // difference.
    const ancestors = new Set<object>();
    let clean = true;
    const walk = (x: unknown, depth: number): unknown => {
      if (x === null || typeof x !== "object") {
        if (typeof x === "function" || typeof x === "symbol") clean = false;
        if (typeof x === "bigint") return `${x}n`;
        return typeof x === "number" && !Number.isFinite(x) ? String(x) : x;
      }
      // A cycle and an exhausted budget both encode as a marker rather than as
      // a value, so two encodings that reach one agree there instead of both
      // becoming incomparable.
      if (ancestors.has(x)) return "[cycle]";
      if (depth > 24) return "[deep]";
      ancestors.add(x);
      let result: unknown;
      if (Array.isArray(x)) result = x.map((e) => walk(e, depth + 1));
      else {
        const out: Record<string, unknown> = {};
        const proto = Object.getPrototypeOf(x) as object | null;
        if (proto !== Object.prototype && proto !== null) out["[class]"] = (x.constructor as { name?: string })?.name ?? "?";
        for (const key of Reflect.ownKeys(x).filter((k): k is string => typeof k === "string").sort()) {
          const descriptor = Object.getOwnPropertyDescriptor(x, key);
          if (descriptor && "value" in descriptor) out[key] = walk(descriptor.value, depth + 1);
        }
        result = out;
      }
      ancestors.delete(x);
      return result;
    };
    try {
      const encoded = JSON.stringify(walk(v, 0));
      return clean ? encoded : undefined;
    } catch {
      return undefined;
    }
  };
  const left = encode(a);
  const right = encode(b);
  if (left === undefined || right === undefined) return { values: "not-data" };
  if (left === right) return { values: "equal" };
  let i = 0;
  while (i < left.length && left[i] === right[i]) i++;
  const at = (s: string) => s.slice(Math.max(0, i - 80), i + 120);
  return { values: "differ", valuesDiff: `at ${i}: chant …${at(left)}… reference …${at(right)}…` };
}

/** A relative specifier resolved on disk the way the reference resolves it against its key set: as written, `.ts`, `.js` rewritten to `.ts`, or a directory's `index.ts`. */
function resolveOnDisk(fromAbs: string, spec: string): string | undefined {
  const base = resolve(dirname(fromAbs), spec);
  for (const cand of [base, `${base}.ts`, base.replace(/\.js$/, ".ts"), resolve(base, "index.ts")]) {
    try { if (statSync(cand).isFile()) return cand; } catch { /* not there */ }
  }
  return undefined;
}

/**
 * The entry's files and every project file they reach by relative import,
 * transitively, the way a build of the entry reaches them (#129): a stack
 * inside a larger project imports its composites and helpers from beside it.
 * Keys are relative to `srcDir`, so a file outside it starts with `../`.
 */
function closeOverImports(srcDir: string, entryPaths: readonly string[]): Map<string, string> {
  const keyOf = (abs: string) => relative(srcDir, abs).split("\\").join("/");
  const sources = new Map<string, string>();
  const queue = [...entryPaths];
  while (queue.length) {
    const abs = queue.shift()!;
    const key = keyOf(abs);
    if (sources.has(key)) continue;
    const source = readFileSync(abs, "utf8");
    sources.set(key, source);
    for (const spec of specifiersOf(source, key).project) {
      const target = resolveOnDisk(abs, spec);
      if (target && !sources.has(keyOf(target))) queue.push(target);
    }
  }
  return sources;
}

/**
 * The `invocation` seed, from syntax alone: a declarator whose call, reached
 * directly, through a member read or through a const alias (F-Declarator),
 * names an import from a project file, where that file's export of the name
 * is not a function it declares (a declaration or a const bound to an arrow,
 * which F-Call step 2 routes to F-Eval-CallLocal whatever the body holds) and
 * not an interpretable composite (step 4). What is left is step 6's case in
 * open mode: a `Composite(fn, …)` whose factory violates S-FactoryBody, or a
 * const bound to something made at run time.
 */
function invocationSeed(sources: ReadonlyMap<string, string>, entryKeys: ReadonlySet<string>): Set<string> {
  const keys = new Set(sources.keys());
  const parsed = new Map<string, ts.SourceFile>();
  const sf = (key: string) => { let f = parsed.get(key); if (!f) { f = ts.createSourceFile(key, sources.get(key)!, ts.ScriptTarget.Latest, true); parsed.set(key, f); } return f; };
  const unwrap = (e: ts.Expression): ts.Expression =>
    ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e) ? unwrap(e.expression) : e;
  const isFn = (e: ts.Expression) => ts.isArrowFunction(e) || ts.isFunctionExpression(e);
  /** Whether `key` exports `name` as something F-Call step 6 would invoke: not a declared function, not an interpretable composite. */
  const invocable = (key: string, name: string): boolean => {
    for (const st of sf(key).statements) {
      const exported = ts.canHaveModifiers(st) ? (ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false) : false;
      if (!exported) continue;
      if (ts.isFunctionDeclaration(st) && st.name?.text === name) return false;
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name) || d.name.text !== name || !d.initializer) continue;
          const init = unwrap(d.initializer);
          if (isFn(init)) return false;
          if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === "Composite") {
            const factory = init.arguments[0] ? unwrap(init.arguments[0]) : undefined;
            return !factory || !isFn(factory) || findFactoryViolation(factory) !== undefined;
          }
          return true;
        }
      }
    }
    return false;
  };
  const seed = new Set<string>();
  for (const key of entryKeys) {
    const file = sf(key);
    const imports = new Map<string, { target: string; name: string }>();
    const consts = new Map<string, ts.Expression>();
    for (const st of file.statements) {
      if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && isProjectSpecifier(st.moduleSpecifier.text)) {
        const target = resolveKey(key, st.moduleSpecifier.text, keys);
        const named = st.importClause?.namedBindings;
        if (target && named && ts.isNamedImports(named)) for (const el of named.elements) imports.set(el.name.text, { target, name: (el.propertyName ?? el.name).text });
      }
      if (ts.isVariableStatement(st) && (st.declarationList.flags & ts.NodeFlags.Const) !== 0) {
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) consts.set(d.name.text, d.initializer);
      }
    }
    const callee = (e: ts.Expression, seen = new Set<string>()): string | undefined => {
      const inner = unwrap(e);
      if (ts.isPropertyAccessExpression(inner) || ts.isElementAccessExpression(inner)) return callee(inner.expression, seen);
      if (ts.isCallExpression(inner) && ts.isIdentifier(inner.expression)) return inner.expression.text;
      if (ts.isIdentifier(inner) && consts.has(inner.text) && !seen.has(inner.text)) { seen.add(inner.text); return callee(consts.get(inner.text)!, seen); }
      return undefined;
    };
    for (const st of file.statements) {
      if (!ts.isVariableStatement(st) || !ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      for (const d of st.declarationList.declarations) {
        if (!d.initializer) continue;
        const c = callee(d.initializer);
        const bound = c ? imports.get(c) : undefined;
        if (bound && !consts.has(c!) && invocable(bound.target, bound.name)) seed.add(key);
      }
    }
  }
  return seed;
}

/** Run one corpus entry through both implementations and classify every file. */
export async function runCorpusEntry(checkout: ChantCheckout, entry: CorpusEntry): Promise<EntryReport> {
  const paths = (await findInfraFiles(entry.srcDir)).filter((p) => !(entry.exclude ?? []).some((x) => p.startsWith(x + "/")));
  const keyOf = (abs: string) => relative(entry.srcDir, abs).split("\\").join("/");
  // Both implementations see what a build sees: the entry's files and the project files they import (#129).
  const sources = closeOverImports(entry.srcDir, paths);
  const entryKeys = new Set(paths.map(keyOf));

  const host = await buildHost(checkout, entry, sources);
  const chant = await chantFoldProject(paths, entry.intrinsics as never, { lexicons: entry.lexicons, buildParams: entry.buildParams });
  const reference = referenceFoldProject(sources, host);

  // #171: the same build under `ι = isolated`, which maps to chant's sandbox
  // (L9.5, chant#1093). A throw here is counted apart rather than read as a
  // refusal, so an entry that breaks isolation is visible instead of silent.
  let chantIsolated: Awaited<ReturnType<typeof chantFoldProject>> | undefined;
  let isolatedUnavailableReason: string | undefined;
  try {
    chantIsolated = await chantFoldProject(paths, entry.intrinsics as never, { lexicons: entry.lexicons, buildParams: entry.buildParams, sandbox: true });
  } catch (e) {
    chantIsolated = undefined;
    isolatedUnavailableReason = e instanceof Error ? e.message : String(e);
  }

  const hostSeed = new Set<string>();
  for (const [key, source] of sources) {
    const { bare } = specifiersOf(source, key);
    if (bare.some((s) => !isChantOwnedSpecifier(s) || host.unloadable.has(s))) hostSeed.add(key);
  }
  const hostLimited = spread(hostSeed, sources, reference.taintSource);
  const invocationLimited = spread(invocationSeed(sources, entryKeys), sources, reference.taintSource);

  // The data-host column: the same host as a description, no code in it.
  const description: Host = { profile: "data-host", intrinsics: host.intrinsics, helpers: [], ownedSpecifierPrefixes: host.ownedSpecifierPrefixes, values: new Map() };
  const conformanceHost: ConformanceHost = { name: "chant", ownedSpecifierPrefixes: host.ownedSpecifierPrefixes, intrinsics: host.intrinsics, helpers: [], values: new Map() };
  const dataHostReference = rust ? referenceFoldProject(sources, description) : undefined;
  const dataHostRust = rust?.foldProject ? await rust.foldProject(new Map(sources), conformanceHost) : undefined;

  // #237: what a build records for the files that run, which foldProject never attributes.
  const projectComposites = (abs: string) => projectCompositeNames(importClosure(keyOf(abs), sources));
  const runOrigins = await runFileOrigins(entry, paths.filter((abs) => chant.get(abs)?.verdict !== "fold"), projectComposites);

  const comparisons: FileComparison[] = paths.map((abs) => {
    const file = keyOf(abs);
    let dataHost: DataHostComparison | undefined;
    if (dataHostReference && dataHostRust && dataHostRust !== "unavailable") {
      const dr = dataHostReference.verdicts.get(file), xr = dataHostRust.verdicts[file];
      const referenceSide: Side = dr?.kind === "fold" ? "fold" : "run", rustSide: Side = xr?.kind === "fold" ? "fold" : "run";
      let agreed = referenceSide === rustSide, diff: string | undefined;
      if (agreed && dr?.kind === "fold" && xr?.kind === "fold") {
        const c = compareData(Object.fromEntries(dr.exports), xr.exports);
        if (c.values === "differ") { agreed = false; diff = c.valuesDiff; }
      } else if (!agreed) {
        diff = dr?.kind === "run" ? `reference ${dr.rule}: ${dr.reason}` : xr?.kind === "run" ? `rust ${xr.rule ?? ""}: ${xr.reason}` : undefined;
      }
      dataHost = { reference: referenceSide, rust: rustSide, agreed, diff };
    }
    const cv = chant.get(abs);
    const rv = reference.verdicts.get(file);
    const chantSide: Side = cv?.verdict === "fold" ? "fold" : "run";
    const referenceSide: Side = rv?.kind === "fold" ? "fold" : "run";
    const limit: Limit | undefined = hostLimited.has(file) ? "host" : invocationLimited.has(file) ? "invocation" : undefined;
    const iv = chantIsolated?.get(abs);
    const isolatedReason = iv?.verdict === "run" ? iv.reason : undefined;
    const base: FileComparison = {
      file,
      chant: chantSide,
      reference: referenceSide,
      limit,
      dataHost,
      chantIsolated: chantIsolated ? (chantIsolated.get(abs)?.verdict === "fold" ? "fold" : "run") : undefined,
      chantIsolatedReason: isolatedReason,
      chantIsolatedRefusal: isolationRefusalOf(isolatedReason),
      origins: cv?.verdict === "fold" ? foldOrigins(cv, projectComposites(abs)) : runOrigins.byFile.get(abs),
      originsUnavailable: cv?.verdict === "fold" ? undefined : runOrigins.unavailableReason,
      referenceRule: rv?.kind === "run" ? rv.rule : undefined,
      referenceReason: rv?.kind === "run" ? rv.reason : undefined,
      chantReason:
        cv?.verdict === "run"
          ? (cv.reason ?? (cv.taintedBy ? `tainted by ${keyOf(cv.taintedBy.from)}` : undefined))
          : undefined,
    };
    if (!cv || !rv || rv.kind !== "fold" || chantSide !== "fold") return base;
    const left = Object.fromEntries(cv.exports ?? new Map());
    const right = Object.fromEntries(rv.exports);
    return { ...base, ...compareData(left, right) };
  });
  const folds = new Map<string, Record<string, unknown>>();
  for (const abs of paths) {
    const rv = reference.verdicts.get(keyOf(abs));
    if (rv?.kind === "fold") folds.set(keyOf(abs), Object.fromEntries(rv.exports));
  }
  return { name: entry.name, files: paths.length, comparisons, isolatedUnavailableReason, oracleInput: { sources, folds } };
}

/**
 * The checker column (#233), over every entry at once: one `tsc` run for the
 * whole corpus. Each file the reference folded is a subject, its unit the
 * entry, so an entry's files are type-checked together as the build they
 * are. `nodeModules` is the checkout's, so a file importing a lexicon sees
 * that lexicon's types. Plain-data exports only; the rest is out of scope.
 */
export function addOracleColumn(reports: readonly EntryReport[], opt: OracleOptions = {}): EntryReport[] {
  const subjects: OracleSubject[] = [];
  for (const r of reports) {
    if (!r.oracleInput) continue;
    for (const [file, exports] of r.oracleInput.folds) subjects.push({ unit: r.name, files: r.oracleInput.sources, file, exports });
  }
  const byFile = new Map<string, OracleResult[]>();
  for (const res of runOracle(subjects, opt)) {
    const k = `${res.unit}\u0000${res.file}`;
    byFile.set(k, [...(byFile.get(k) ?? []), res]);
  }
  return reports.map((r) => ({
    ...r,
    comparisons: r.comparisons.map((c) => {
      const oracle = byFile.get(`${r.name}\u0000${c.file}`);
      return oracle ? { ...c, oracle } : c;
    }),
  }));
}

// ── the summary the paper cites ─────────────────────────────────────────────

export type Disagreement = FileComparison & { entry: string };

export interface CorpusSummary {
  readonly entries: number;
  readonly files: number;
  /** Files neither implementation is disarmed on. */
  readonly comparable: number;
  readonly comparableAgreed: number;
  /** Comparable files both folded, with export namespaces equal as data. */
  readonly comparableBothFold: number;
  readonly comparableValuesNotData: number;
  /** Files that are not comparable, by which limit disarmed them first. */
  readonly limited: Readonly<Record<Limit, number>>;
  /** Differences inside the comparable set: real, and each one triaged. */
  readonly disagreements: readonly Disagreement[];
  /**
   * A reference fold where chant runs, anywhere in the corpus. Both limits are
   * the reference's and can only make it refuse more, never less, so a fold it
   * reaches and chant does not has no benign explanation wherever it appears.
   */
  readonly referenceMorePermissive: readonly Disagreement[];
  /** The data-host column, when the evaluator with no JavaScript runtime was present. */
  readonly dataHost?: { readonly files: number; readonly agreed: number; readonly bothFold: number; readonly disagreements: readonly Disagreement[] };
  /**
   * The checker column (#233), when `addOracleColumn` ran: exports of folded
   * files by verdict, and the literal coverage, which is how much the pass
   * count is worth. A failure here is an evaluator bug, an oracle bug or a
   * lying assertion, and each is triaged by name.
   */
  readonly oracle?: {
    readonly files: number;
    readonly exports: number;
    readonly outOfScope: number;
    readonly pass: number;
    readonly unchecked: number;
    readonly failures: readonly (OracleResult & { entry: string })[];
    readonly leaves: number;
    readonly checkedLeaves: number;
  };
  /**
   * The isolation column (#171): what refusing every project-owned invocation
   * costs in coverage. `lost` is what folds under `open` and does not under
   * `isolated`, which is the price of the guarantee.
   */
  readonly isolated?: {
    readonly files: number;
    readonly openFolds: number;
    readonly isolatedFolds: number;
    /** Counted from `lostFiles`, never subtracted, so the number and the list it sits above cannot disagree. */
    readonly lost: number;
    /**
     * `lost` split by what was refused, all three of them isolation's own.
     *
     * `factory` is F-Call step 6. It used to carry #169's cost as well, since
     * step 6 invoked project files under `open` too, and the note here said it
     * would reach zero once chant implemented #199. chant 0.73.0 implements it
     * and the column still reads 1, because what step 5 refuses is a PROJECT
     * file and what remains is a package's factory: `prod-watch.op.ts` calls
     * `WatchOp` from `@intentius/chant/op`, which folds under `open` and is
     * untrusted under `isolated`. So the prediction was wrong about the kind
     * of thing being counted, not about the rule.
     */
    readonly lostByKind: Readonly<Record<IsolationRefusal, number>>;
    /**
     * Files that run under `open` and fold under `isolated`. `F-IsolatedRefusal`
     * only refuses more, so this is zero. It is counted rather than assumed,
     * because the subtraction that used to produce `lost` would have absorbed
     * one of these silently.
     */
    readonly gained: number;
    readonly unavailable: number;
    readonly unavailableReason?: string;
    readonly lostFiles: readonly Disagreement[];
  };
}

export function summarize(reports: readonly EntryReport[]): CorpusSummary {
  let files = 0, comparable = 0, comparableAgreed = 0, comparableBothFold = 0, comparableValuesNotData = 0;
  const limited: Record<Limit, number> = { host: 0, invocation: 0 };
  const disagreements: Disagreement[] = [];
  const referenceMorePermissive: Disagreement[] = [];
  let dhFiles = 0, dhAgreed = 0, dhBothFold = 0;
  const dhDisagreements: Disagreement[] = [];
  let isoFiles = 0, isoOpenFolds = 0, isoFolds = 0, isoUnavailable = 0, isoGained = 0;
  let isoUnavailableReason: string | undefined;
  const isoLostFiles: Disagreement[] = [];
  const oracleResults: OracleResult[] = [];
  let oracleFiles = 0;
  for (const report of reports) {
    files += report.files;
    isoUnavailableReason ??= report.isolatedUnavailableReason;
    for (const c of report.comparisons) {
      if (c.oracle) { oracleFiles++; oracleResults.push(...c.oracle); }
      if (c.chantIsolated === undefined) isoUnavailable++;
      else {
        isoFiles++;
        if (c.chant === "fold") isoOpenFolds++;
        if (c.chantIsolated === "fold") isoFolds++;
        if (c.chant === "fold" && c.chantIsolated === "run") isoLostFiles.push({ ...c, entry: report.name });
        if (c.chant === "run" && c.chantIsolated === "fold") isoGained++;
      }
      if (c.dataHost) {
        dhFiles++;
        if (c.dataHost.agreed) { dhAgreed++; if (c.dataHost.reference === "fold") dhBothFold++; } else dhDisagreements.push({ ...c, entry: report.name });
      }
      if (c.reference === "fold" && c.chant === "run") referenceMorePermissive.push({ ...c, entry: report.name });
      if (c.limit) { limited[c.limit]++; continue; }
      comparable++;
      if (c.chant === c.reference && c.values !== "differ") comparableAgreed++;
      else disagreements.push({ ...c, entry: report.name });
      if (c.values === "equal") comparableBothFold++;
      if (c.values === "not-data") comparableValuesNotData++;
    }
  }
  // The fixtures' expected failures are keyed by fixture, so none applies here: every corpus failure is listed.
  const oracle = summarizeOracle(oracleResults, {});
  return {
    oracle: oracleFiles
      ? {
          files: oracleFiles, exports: oracle.exports, outOfScope: oracle.outOfScope, pass: oracle.pass, unchecked: oracle.unchecked,
          failures: oracle.failUnexpected.map((r) => ({ ...r, entry: r.unit })), leaves: oracle.leaves, checkedLeaves: oracle.checkedLeaves,
        }
      : undefined,
    entries: reports.length, files, comparable, comparableAgreed, comparableBothFold,
    comparableValuesNotData, limited, disagreements, referenceMorePermissive,
    dataHost: dhFiles ? { files: dhFiles, agreed: dhAgreed, bothFold: dhBothFold, disagreements: dhDisagreements } : undefined,
    isolated: isoFiles
      ? {
          files: isoFiles, openFolds: isoOpenFolds, isolatedFolds: isoFolds,
          lost: isoLostFiles.length,
          // Counted from the same list `lost` is, so the split cannot disagree
          // with the total the way a subtraction could (#197).
          lostByKind: isoLostFiles.reduce(
            (acc, d) => ({ ...acc, [d.chantIsolatedRefusal ?? "other"]: acc[d.chantIsolatedRefusal ?? "other"] + 1 }),
            { factory: 0, constructor: 0, import: 0, other: 0 } as Record<IsolationRefusal, number>,
          ),
          gained: isoGained, unavailable: isoUnavailable, unavailableReason: isoUnavailableReason, lostFiles: isoLostFiles,
        }
      : undefined,
  };
}

/** The committed evidence artifact. Numbers here are produced by the run, never typed in. */
/** One external checkout's run (#129): its rows sit beside chant's corpus and never inside its totals. */
export interface ExternalRun { readonly checkout: ExternalCheckout; readonly summary: CorpusSummary; readonly reports: readonly EntryReport[] }

export function renderCorpusReport(
  checkout: ChantCheckout,
  engine: { name: string; specVersion: string },
  summary: CorpusSummary,
  reports: readonly EntryReport[],
  external: readonly ExternalRun[] = [],
): string {
  const row = (r: EntryReport) => {
    const s = summarize([r]);
    return `| \`${r.name}\` | ${r.files} | ${s.comparable} | ${s.comparableAgreed} | ${s.limited.host} | ${s.limited.invocation} |`;
  };
  const rows = [...reports.map(row), ...external.flatMap((x) => x.reports.map(row))];
  const line = (d: Disagreement) =>
    `- \`${d.entry}/${d.file}\`: chant ${d.chant}, reference ${d.reference}${d.values ? `, values ${d.values}` : ""}${d.valuesDiff ? ` (${d.valuesDiff})` : ""}` +
    `${d.referenceReason ? ` — reference ${d.referenceRule}: ${d.referenceReason}` : ""}` +
    `${d.chantReason ? ` — chant: ${d.chantReason}` : ""}`;
  return [
    "# Corpus cross-check",
    "",
    "Generated by `npm run corpus` (#25). Do not edit, and do not regenerate partially. A run without the Rust evaluator built, or without the external checkouts fetched, silently drops whole sections and every value in them — and anything downstream that trusted those values then fails somewhere that does not point at the cause. Regenerate all of it or none of it.",
    "",
    `- engine under test: \`${engine.name}\`, declaring spec \`${engine.specVersion}\``,
    `- corpus: chant \`${checkout.corpusVersion}\` at \`${checkout.revision}\`, ${summary.entries} entries, ${summary.files} files`,
    "",
    "## Totals",
    "",
    "| Files | Comparable | Agreed | Both fold | No host | No invocation |",
    "|---|---|---|---|---|---|",
    `| ${summary.files} | ${summary.comparable} | ${summary.comparableAgreed} | ${summary.comparableBothFold} |` +
      ` ${summary.limited.host} | ${summary.limited.invocation} |`,
    "",
    "Both limits disarm the reference: a package its host could not load, and a project function a declarator would invoke in open mode (F-Call step 6), which the reference never does. chant is given the entry's lexicons and build parameters, the inputs a real build has.",
    "",
    `Of the comparable files both implementations folded, ${summary.comparableValuesNotData} held something that is not data on one side or the other, so only the verdict was compared there.`,
    "",
    "## Disagreements inside the comparable set",
    "",
    summary.disagreements.length === 0 ? "None." : summary.disagreements.map(line).join("\n"),
    "",
    "## Reference folds where chant runs",
    "",
    summary.referenceMorePermissive.length === 0
      ? "None."
      : summary.referenceMorePermissive.map(line).join("\n"),
    "",
    ...(summary.dataHost && dataHostEvaluator ? [
      "## The data-host column",
      "",
      `- evaluator: \`${dataHostEvaluator.name}\`, declaring spec \`${dataHostEvaluator.specVersion}\`, no JavaScript runtime`,
      "",
      "| Files | Agreed | Both fold |",
      "|---|---|---|",
      `| ${summary.dataHost.files} | ${summary.dataHost.agreed} | ${summary.dataHost.bothFold} |`,
      "",
      "The reference and the evaluator are both judged in `data-host`, on the same host description and no code. A file that folds on both sides has the same namespace on both, envelopes included.",
      "",
      summary.dataHost.disagreements.length === 0 ? "No disagreements." : summary.dataHost.disagreements.map((d) => `- \`${d.entry}/${d.file}\`: reference ${d.dataHost!.reference}, evaluator ${d.dataHost!.rust}${d.dataHost!.diff ? ` (${d.dataHost!.diff})` : ""}`).join("\n"),
      "",
    ] : []),
    ...(summary.oracle ? [
      "## The checker column",
      "",
      "Each export of a file the reference folded, against the type `tsc` gives it, with const inference forced (#233). Nothing is executed. Plain-data exports only: an export that constructs with `new`, or whose fold holds a live value or an envelope, is out of scope. A pass means the fold and the checker's literal type are mutually assignable at every node; where the checker has no literal the export is unchecked, never passed.",
      "",
      "| Files | Exports | Out of scope | Pass | Unchecked | Fail | Literal coverage |",
      "|---|---|---|---|---|---|---|",
      `| ${summary.oracle.files} | ${summary.oracle.exports} | ${summary.oracle.outOfScope} | ${summary.oracle.pass} | ${summary.oracle.unchecked} | ${summary.oracle.failures.length} | ${summary.oracle.checkedLeaves} of ${summary.oracle.leaves} leaves${summary.oracle.leaves ? ` (${((100 * summary.oracle.checkedLeaves) / summary.oracle.leaves).toFixed(1)}%)` : ""} |`,
      "",
      summary.oracle.failures.length === 0
        ? "No export fails."
        : summary.oracle.failures.map((f) => `- \`${f.entry}/${f.file}\` export \`${f.exportName}\`: ${f.diagnostics.join("; ").replace(/\s+/g, " ")}`).join("\n"),
      "",
    ] : []),
    ...(summary.isolated ? [
      "## The isolation column",
      "",
      "What `ι = isolated` costs in coverage (#171). Under it `F-IsolatedRefusal` refuses every project-owned invocation, so a file whose fold would invoke project code runs instead. The difference is the price of the guarantee.",
      "",
      "| Files | Folds under `open` | Folds under `isolated` | Lost to isolation |",
      "|---|---|---|---|",
      `| ${summary.isolated.files} | ${summary.isolated.openFolds} | ${summary.isolated.isolatedFolds} | ${summary.isolated.lost} |`,
      "",
      "What was refused, from the reason chant gave. All three are isolation's own. A `factory` is F-Call step 6, and spec 2.0 already refuses the project-file half of it in every mode, so what is left here is a package's factory that an isolated build will not trust.",
      "",
      "| Composite factory | Constructor | Import | Unclassified |",
      "|---|---|---|---|",
      `| ${summary.isolated.lostByKind.factory} | ${summary.isolated.lostByKind.constructor} | ${summary.isolated.lostByKind.import} | ${summary.isolated.lostByKind.other} |`,
      "",
      ...(summary.isolated.lostByKind.other ? [`${summary.isolated.lostByKind.other} refusal(s) did not match a wording this report knows, so the split is short by that many rather than putting them in the wrong column.`, ""] : []),
      ...(summary.isolated.unavailable
        ? [`${summary.isolated.unavailable} files had no isolated verdict and are counted apart, so an entry that breaks isolation is visible rather than silent.${summary.isolated.unavailableReason ? ` First reason: ${summary.isolated.unavailableReason}` : ""}`, ""]
        : []),
      ...(summary.isolated.gained
        ? [`**${summary.isolated.gained} files fold under \`isolated\` and run under \`open\`.** \`F-IsolatedRefusal\` only refuses more, so this should be zero and is a defect in the implementation or in the rule.`, ""]
        : []),
      summary.isolated.lost === 0
        ? "Nothing folds under `open` and runs under `isolated`."
        : `Files that fold under \`open\` and run under \`isolated\`:\n\n${summary.isolated.lostFiles.map((d) => `- \`${d.entry}/${d.file}\`${d.chantIsolatedRefusal ? ` — ${d.chantIsolatedRefusal}` : ""}`).join("\n")}`,
      "",
    ] : []),
    ...renderProvenanceSection(reports, external),
    ...(external.length ? [
      "## Codebases nobody here maintains",
      "",
      "Read at a pinned revision by `scripts/fetch-corpus-external.sh` from `corpus-external.json` (#129), folded with the host a build of that project would have at the pinned chant, and kept out of the totals above.",
      "",
      "| Checkout | Revision | Entries | Files | Comparable | Agreed | Both fold | No host | No invocation |",
      "|---|---|---|---|---|---|---|---|---|",
      ...external.map((x) => `| \`${x.checkout.name}\` | \`${x.checkout.headRevision.slice(0, 8)}\` | ${x.summary.entries} | ${x.summary.files} | ${x.summary.comparable} | ${x.summary.comparableAgreed} | ${x.summary.comparableBothFold} | ${x.summary.limited.host} | ${x.summary.limited.invocation} |`),
      "",
      ...external.flatMap((x) => [
        `### \`${x.checkout.name}\``,
        "",
        x.checkout.note ?? "",
        "",
        x.summary.disagreements.length === 0 ? "No disagreements inside the comparable set." : x.summary.disagreements.map((d) => `${line(d)}${x.checkout.disagreements?.[`${d.entry}/${d.file}`] ? ` — triaged: ${x.checkout.disagreements[`${d.entry}/${d.file}`]}` : ""}`).join("\n"),
        ...(x.summary.referenceMorePermissive.length ? ["", "Reference folds where chant runs:", "", x.summary.referenceMorePermissive.map(line).join("\n")] : []),
        "",
      ]),
    ] : []),
    "## Per entry",
    "",
    "| Entry | Files | Comparable | Agreed | No host | No invocation |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

// ── the provenance column (#237) ────────────────────────────────────────────

/**
 * One file's emitted fields by origin, in F-Obs-Provenance's four kinds.
 * A field is one of chant's emitted property paths: dotted names through
 * plain objects, an array or a class value attributed whole at its own path
 * (`emittedFieldPaths`). Entities that emit no field are not counted.
 */
export interface OriginCounts {
  readonly entities: number;
  readonly direct: number;
  readonly parameter: number;
  readonly literal: number;
  /** `unknown` fields by the reason chant gives (`UnknownOriginReason`). */
  readonly unknown: Readonly<Record<string, number>>;
  /**
   * `unknown` fields by the composite that expanded their entity, keyed
   * `<name> (project)` when the declaring file, or a project file it
   * imports, defines a composite of that name; `<name> (package)` otherwise,
   * a lexicon's composite, which chant invokes rather than interprets; and
   * `(none)` when the record names no composite.
   */
  readonly unknownByComposite: Readonly<Record<string, number>>;
}

/** Where a file's counts came from: chant's fold record, or the record a build of the entry keeps for a file that runs. */
export interface FileOrigins extends OriginCounts { readonly from: "fold" | "build" }

/** chant's `FoldProvenance`, restated: the pinned chant may not export it (chant#3598). */
type FoldProvenanceRecord = Record<string, { composite?: string; instance?: string; fields: Record<string, { kind: string; reason?: string }> }>;

export const NO_ORIGINS: OriginCounts = { entities: 0, direct: 0, parameter: 0, literal: 0, unknown: {}, unknownByComposite: {} };

export const unknownTotal = (c: OriginCounts): number => Object.values(c.unknown).reduce((n, k) => n + k, 0);
export const fieldTotal = (c: OriginCounts): number => c.direct + c.parameter + c.literal + unknownTotal(c);

function addCounts(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) + n;
  return out;
}

export function addOrigins(a: OriginCounts, b: OriginCounts): OriginCounts {
  return {
    entities: a.entities + b.entities, direct: a.direct + b.direct, parameter: a.parameter + b.parameter, literal: a.literal + b.literal,
    unknown: addCounts(a.unknown, b.unknown), unknownByComposite: addCounts(a.unknownByComposite, b.unknownByComposite),
  };
}

/** Count a fold provenance record. An origin kind this report does not know is counted `unknown` under its own name rather than dropped. */
export function countOrigins(record: FoldProvenanceRecord, projectComposites: ReadonlySet<string> = new Set()): OriginCounts {
  let direct = 0, parameter = 0, literal = 0, entities = 0;
  const unknown: Record<string, number> = {};
  const unknownByComposite: Record<string, number> = {};
  for (const entity of Object.values(record)) {
    const fields = Object.values(entity.fields);
    if (fields.length === 0) continue;
    entities++;
    for (const o of fields) {
      if (o.kind === "direct") direct++;
      else if (o.kind === "composite-parameter") parameter++;
      else if (o.kind === "composite-literal") literal++;
      else {
        const reason = o.kind === "unknown" ? (o.reason ?? "unstated") : `kind ${o.kind}`;
        unknown[reason] = (unknown[reason] ?? 0) + 1;
        const by = entity.composite ? `${entity.composite} (${projectComposites.has(entity.composite) ? "project" : "package"})` : "(none)";
        unknownByComposite[by] = (unknownByComposite[by] ?? 0) + 1;
      }
    }
  }
  return { entities, direct, parameter, literal, unknown, unknownByComposite };
}

/** A folded file's counts from foldProject's own record, or undefined when the verdict carries none. */
function foldOrigins(verdict: unknown, projectComposites: ReadonlySet<string>): FileOrigins | undefined {
  const record = (verdict as { foldProvenance?: FoldProvenanceRecord }).foldProvenance;
  return record ? { from: "fold", ...countOrigins(record, projectComposites) } : undefined;
}

/** A file and every project file it reaches by relative import, transitively: the source its composites can come from. */
function importClosure(key: string, sources: ReadonlyMap<string, string>): Map<string, string> {
  const keys = new Set(sources.keys());
  const out = new Map<string, string>();
  const queue = [key];
  while (queue.length) {
    const k = queue.shift()!;
    const source = sources.get(k);
    if (source === undefined || out.has(k)) continue;
    out.set(k, source);
    for (const spec of specifiersOf(source, k).project) {
      const target = resolveKey(k, spec, keys);
      if (target && !out.has(target)) queue.push(target);
    }
  }
  return out;
}

/**
 * The composites a file's own source defines, by the name chant records
 * for them: the literal a project passes as `Composite`'s second argument,
 * plus `anonymous`, chant's name for one given none. Every other composite
 * name came from a package, whether exported as a composite or built inside a
 * package function (`ArgoAppFor` makes an `ArgoApplication`).
 */
export function projectCompositeNames(sources: ReadonlyMap<string, string>): Set<string> {
  const out = new Set<string>(["anonymous"]);
  for (const [path, source] of sources) {
    if (!source.includes("Composite")) continue;
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "Composite") {
        const name = n.arguments[1];
        if (name && ts.isStringLiteralLike(name)) out.add(name.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true));
  }
  return out;
}

type DiscoverFn = (path: string, options: Record<string, unknown>) => Promise<{ entities: Map<string, unknown> }>;
type ProvenanceOfEntitiesFn = (entities: ReadonlyMap<string, unknown>, provenanceOf: (e: unknown) => unknown) => FoldProvenanceRecord;

/**
 * What a build of the entry records for its files that run. foldProject
 * never executes a run file, so it has no entities to attribute; a build
 * does execute it, and records an origin for every field anyway: `direct`
 * for an entity the file declared, `unknown` for a composite whose body it
 * did not interpret. This is chant's `build()` computation (`discover`, then
 * `foldProvenanceOfEntities` with `getProvenance`), short of serializing,
 * and it runs the entry's run files in this process the way `chant build`
 * does. Each entity is assigned to the file that declared it.
 */
async function runFileOrigins(entry: CorpusEntry, runFiles: readonly string[], projectComposites: (abs: string) => ReadonlySet<string>): Promise<{ byFile: Map<string, FileOrigins>; unavailableReason?: string }> {
  const byFile = new Map<string, FileOrigins>();
  if (runFiles.length === 0) return { byFile };
  const ns = (await import("@intentius/chant")) as unknown as { discover?: DiscoverFn; getProvenance?: (e: unknown) => { sourceFile?: string } | undefined; foldProvenanceOfEntities?: ProvenanceOfEntitiesFn };
  if (!ns.discover || !ns.getProvenance || !ns.foldProvenanceOfEntities) return { byFile, unavailableReason: "the installed chant reports no fold provenance" };
  try {
    const result = await ns.discover(entry.srcDir, {
      fold: true,
      intrinsics: entry.intrinsics,
      lexicons: entry.lexicons,
      buildParams: Object.entries(entry.buildParams).map(([name, value]) => ({ name, value, source: "default" })),
    });
    const record = ns.foldProvenanceOfEntities(result.entities, ns.getProvenance);
    const wanted = new Set(runFiles.map((f) => resolve(f)));
    const perFile = new Map<string, FoldProvenanceRecord>();
    for (const [name, entityRecord] of Object.entries(record)) {
      const file = ns.getProvenance(result.entities.get(name))?.sourceFile;
      if (!file || !wanted.has(resolve(file))) continue;
      const k = resolve(file);
      perFile.set(k, { ...(perFile.get(k) ?? {}), [name]: entityRecord });
    }
    for (const f of runFiles) byFile.set(f, { from: "build", ...countOrigins(perFile.get(resolve(f)) ?? {}, projectComposites(f)) });
    return { byFile };
  } catch (e) {
    return { byFile, unavailableReason: e instanceof Error ? e.message.split("\n")[0] : String(e) };
  }
}

/** The provenance column over a set of entries: files that fold and files that run, kept apart. */
export interface ProvenanceSummary {
  readonly fold: { readonly files: number; readonly withRecord: number; readonly counts: OriginCounts };
  readonly run: { readonly files: number; readonly withRecord: number; readonly counts: OriginCounts; readonly unavailable: readonly string[] };
}

export function summarizeProvenance(reports: readonly EntryReport[]): ProvenanceSummary {
  let foldFiles = 0, foldWith = 0, runFiles = 0, runWith = 0;
  let fold = NO_ORIGINS, run = NO_ORIGINS;
  const unavailable = new Set<string>();
  for (const r of reports) {
    for (const c of r.comparisons) {
      if (c.chant === "fold") {
        foldFiles++;
        if (c.origins) { foldWith++; fold = addOrigins(fold, c.origins); }
      } else {
        runFiles++;
        if (c.origins) { runWith++; run = addOrigins(run, c.origins); }
        else if (c.originsUnavailable) unavailable.add(`${r.name}: ${c.originsUnavailable}`);
      }
    }
  }
  return { fold: { files: foldFiles, withRecord: foldWith, counts: fold }, run: { files: runFiles, withRecord: runWith, counts: run, unavailable: [...unavailable] } };
}

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);

/** (direct + parameter + literal) / every field. */
export const knownShare = (c: OriginCounts): string => pct(c.direct + c.parameter + c.literal, fieldTotal(c));

/** Among fields a composite expanded: (parameter + literal) / (parameter + literal + unknown because the composite was not interpreted). */
export const compositeKnownShare = (c: OriginCounts): string =>
  pct(c.parameter + c.literal, c.parameter + c.literal + (c.unknown["composite-not-interpreted"] ?? 0));

/** The section `renderCorpusReport` prints, or nothing when no file carries a record (a chant without provenance). */
export function renderProvenanceSection(reports: readonly EntryReport[], external: readonly ExternalRun[] = []): string[] {
  const all = [...reports, ...external.flatMap((x) => x.reports)];
  if (!all.some((r) => r.comparisons.some((c) => c.origins))) return [];
  const s = summarizeProvenance(reports);
  const reasons = [...new Set([...Object.keys(s.fold.counts.unknown), ...Object.keys(s.run.counts.unknown)])].sort();
  const cells = (c: OriginCounts) => `${c.entities} | ${fieldTotal(c)} | ${c.direct} | ${c.parameter} | ${c.literal} | ${unknownTotal(c)}`;
  const shares = (c: OriginCounts) => `${knownShare(c)} | ${compositeKnownShare(c)}`;
  const both = addOrigins(s.fold.counts, s.run.counts);
  const byComposite = (c: OriginCounts) => Object.entries(c.unknownByComposite).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
  const fileRows = all.flatMap((r) =>
    r.comparisons
      .filter((c) => c.origins && fieldTotal(c.origins) > 0)
      .map((c) => `| \`${r.name}/${c.file}\` | ${c.chant} | ${cells(c.origins!)} | ${Object.entries(c.origins!.unknown).map(([k, n]) => `${k} ${n}`).join(", ")} |`),
  );
  return [
    "## The provenance column",
    "",
    "Every field an entity emits, by where its value came from (F-Obs-Provenance): written directly, a composite's parameter, a literal a composite fixes, or unknown with the reason chant gives. A field is one of chant's emitted property paths, with an array attributed whole. Files that fold are counted from chant's fold record. Files that run have no fold record, so their row is what a build of the entry records for them, taken by executing them as `chant build` would; a build attributes a run file's composite fields as unknown.",
    "",
    "| Verdict | Files | With a record | Entities | Fields | Direct | Composite parameter | Composite literal | Unknown | Known share | Known among composite fields |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    `| fold | ${s.fold.files} | ${s.fold.withRecord} | ${cells(s.fold.counts)} | ${shares(s.fold.counts)} |`,
    `| run | ${s.run.files} | ${s.run.withRecord} | ${cells(s.run.counts)} | ${shares(s.run.counts)} |`,
    `| all | ${s.fold.files + s.run.files} | ${s.fold.withRecord + s.run.withRecord} | ${cells(both)} | ${shares(both)} |`,
    "",
    "Unknown fields by reason:",
    "",
    "| Reason | Fold | Run |",
    "|---|---|---|",
    ...(reasons.length ? reasons.map((k) => `| \`${k}\` | ${s.fold.counts.unknown[k] ?? 0} | ${s.run.counts.unknown[k] ?? 0} |`) : ["| none | 0 | 0 |"]),
    "",
    "Unknown fields by the composite that expanded them, largest first. `project` marks a composite defined in the declaring file or a project file it imports, by the name it gives `Composite`; `package` is every other, a lexicon's composite, which chant invokes rather than interprets.",
    "",
    "| Composite | Fold | Run |",
    "|---|---|---|",
    ...Object.keys(both.unknownByComposite)
      .sort((a, b) => both.unknownByComposite[b] - both.unknownByComposite[a] || a.localeCompare(b))
      .map((k) => `| \`${k}\` | ${s.fold.counts.unknownByComposite[k] ?? 0} | ${s.run.counts.unknownByComposite[k] ?? 0} |`),
    "",
    ...(s.run.unavailable.length ? ["Entries whose run files could not be attributed, because the build failed:", "", ...s.run.unavailable.map((u) => `- ${u}`), ""] : []),
    ...(external.length ? [
      "Codebases nobody here maintains, each kept out of the totals above:",
      "",
      "| Checkout | Verdict | Files | With a record | Entities | Fields | Direct | Composite parameter | Composite literal | Unknown | Known share | Known among composite fields | Unknown by composite |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
      ...external.flatMap((x) => {
        const e = summarizeProvenance(x.reports);
        return [
          `| \`${x.checkout.name}\` | fold | ${e.fold.files} | ${e.fold.withRecord} | ${cells(e.fold.counts)} | ${shares(e.fold.counts)} | ${byComposite(e.fold.counts)} |`,
          `| \`${x.checkout.name}\` | run | ${e.run.files} | ${e.run.withRecord} | ${cells(e.run.counts)} | ${shares(e.run.counts)} | ${byComposite(e.run.counts)} |`,
        ];
      }),
      "",
    ] : []),
    "Per file, every file that emits a field:",
    "",
    "| File | Verdict | Entities | Fields | Direct | Composite parameter | Composite literal | Unknown | Unknown by reason |",
    "|---|---|---|---|---|---|---|---|---|",
    ...fileRows,
    "",
  ];
}

/**
 * The provenance column as an artifact of its own, `provenance-report.md`,
 * for the evidence page to read. `corpus-report.md` is regenerated whole at a
 * chant pin, and the column can be taken before the pin carries provenance,
 * so it is written apart; undefined when no file carries a record, so a run at
 * a pin without provenance leaves the last measurement in place rather than
 * blanking it.
 */
export function renderProvenanceReport(
  checkout: ChantCheckout,
  engine: { name: string; specVersion: string },
  reports: readonly EntryReport[],
  external: readonly ExternalRun[] = [],
): string | undefined {
  const section = renderProvenanceSection(reports, external);
  if (section.length === 0) return undefined;
  const files = reports.reduce((n, r) => n + r.files, 0);
  return [
    "# Field provenance across the corpus",
    "",
    "Generated by `npm run corpus` (#237) when the chant under test reports fold provenance. Do not edit. The same section is in `corpus-report.md` once the pinned chant carries provenance.",
    "",
    `- engine under test: \`${engine.name}\`, declaring spec \`${engine.specVersion}\``,
    `- corpus: chant \`${checkout.corpusVersion}\` at \`${checkout.revision}\`, ${reports.length} entries, ${files} files`,
    "",
    ...section,
  ].join("\n");
}
