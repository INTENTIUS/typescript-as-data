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
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { foldProject as chantFoldProject } from "@intentius/chant";
import { findInfraFiles } from "@intentius/chant/discovery/files";
import { FOLDABLE_AUTHORING_HELPERS, isChantOwnedSpecifier } from "@intentius/chant/fold/foldable-helpers";
import { foldProject as referenceFoldProject, type Host } from "@intentius/tsad-reference";

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
  /** True when the entry's `chant.config.ts` declares build parameters — see {@link EntryReport}. */
  readonly buildParams: boolean;
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
    discoverCorpus(): Promise<{ name: string; srcDir: string; intrinsics: readonly ChantIntrinsic[] }[]>;
    entryBuildParams(entry: unknown): Promise<readonly unknown[]>;
  };
  const entries = await mod.discoverCorpus();
  return Promise.all(
    entries.map(async (e) => ({
      name: e.name,
      srcDir: e.srcDir,
      intrinsics: e.intrinsics,
      buildParams: (await mod.entryBuildParams(e)).length > 0,
    })),
  );
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
  /** The reference implements no composite factory form; see `packages/reference/CAVEATS.md`. */
  | "composite"
  /** chant's whole-build entry takes no build parameters, so a file reading one cannot fold on its side. */
  | "build-params"
  /**
   * chant's whole-build entry takes no lexicon list, so F-Host-Trust arm 1 is
   * disabled on its side (L9.4) and a host data export read as a value is an
   * unresolved identifier there, exactly as the rule says it must be for a
   * build with no package list. The reference was handed the same packages'
   * real exports, so the two were asked different questions.
   */
  | "lexicon-list";

/** Which implementation a limit disarms. A limit can only make its own side refuse more. */
export const LIMIT_SIDE: Readonly<Record<Limit, "reference" | "chant">> = {
  host: "reference",
  composite: "reference",
  "build-params": "chant",
  "lexicon-list": "chant",
};

export interface FileComparison {
  readonly file: string;
  readonly chant: Side;
  readonly reference: Side;
  /** The first limit that applies, for the comparable-set accounting. */
  readonly limit?: Limit;
  /** A chant-side limit that also applies, whichever side `limit` names. A file can be disarmed on both sides at once. */
  readonly chantLimit?: "lexicon-list" | "build-params";
  /** Both folded, and their export namespaces were compared as data. */
  readonly values?: "equal" | "differ" | "not-data";
  readonly referenceRule?: string;
  readonly referenceReason?: string;
  readonly chantReason?: string;
}

export interface EntryReport {
  readonly name: string;
  readonly files: number;
  readonly comparisons: readonly FileComparison[];
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
function usesCompositeFactory(source: string, path: string, host: CorpusHost): boolean {
  const bound = hostBoundNames(source, path, host);
  if (bound.size === 0) return false;
  const known = new Set([...host.intrinsics.map((i) => i.name), ...host.helpers.map((h) => h.name)]);
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (bound.has(name) && !known.has(name)) found = true;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

/**
 * True when the file uses a host-owned binding in a position chant can only
 * resolve through its active-lexicon set: as a value, as the object of a
 * member read, or as the callee of a registered eager intrinsic. A
 * constructor, an intrinsic tag and a factory call are resolved by other
 * paths and do not need the list. Mirrors `resolveActiveLexiconExport`'s
 * gate in chant, from syntax alone.
 */
function needsLexiconList(source: string, path: string, host: CorpusHost): boolean {
  const bound = hostBoundNames(source, path, host);
  if (bound.size === 0) return false;
  const eager = new Set(host.intrinsics.filter((i) => i.foldsEagerly).map((i) => i.name));
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(node) && bound.has(node.text)) {
      const parent = node.parent;
      const isDeclarationSite = ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent);
      const isPropertyName = ts.isPropertyAccessExpression(parent) && parent.name === node;
      const isTypePosition = ts.isTypeReferenceNode(parent) || ts.isQualifiedName(parent);
      const isConstructor = ts.isNewExpression(parent) && parent.expression === node;
      const isTag = ts.isTaggedTemplateExpression(parent) && parent.tag === node;
      const isCallee = ts.isCallExpression(parent) && parent.expression === node;
      if (isDeclarationSite || isPropertyName || isTypePosition || isConstructor || isTag) return;
      if (isCallee && !eager.has(node.text)) return;
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

/** The reference's own resolution: a relative specifier against the project's key set. */
function resolveKey(from: string, spec: string, keys: ReadonlySet<string>): string | undefined {
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const joined = spec.startsWith("./") ? base + spec.slice(2) : spec.startsWith("../") ? spec : base + spec;
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
function compareData(a: unknown, b: unknown): "equal" | "differ" | "not-data" {
  const encode = (v: unknown): string | undefined => {
    const seen = new WeakSet<object>();
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
      if (seen.has(x)) return "[cycle]";
      if (depth > 24) return "[deep]";
      seen.add(x);
      if (Array.isArray(x)) return x.map((e) => walk(e, depth + 1));
      const out: Record<string, unknown> = {};
      const proto = Object.getPrototypeOf(x) as object | null;
      if (proto !== Object.prototype && proto !== null) out["[class]"] = (x.constructor as { name?: string })?.name ?? "?";
      for (const key of Reflect.ownKeys(x).filter((k): k is string => typeof k === "string").sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(x, key);
        if (descriptor && "value" in descriptor) out[key] = walk(descriptor.value, depth + 1);
      }
      return out;
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
  if (left === undefined || right === undefined) return "not-data";
  return left === right ? "equal" : "differ";
}

/** Run one corpus entry through both implementations and classify every file. */
export async function runCorpusEntry(checkout: ChantCheckout, entry: CorpusEntry): Promise<EntryReport> {
  const paths = await findInfraFiles(entry.srcDir);
  const keyOf = (abs: string) => relative(entry.srcDir, abs).split("\\").join("/");
  const sources = new Map(paths.map((p) => [keyOf(p), readFileSync(p, "utf8")]));

  const host = await buildHost(checkout, entry, sources);
  const chant = await chantFoldProject(paths, entry.intrinsics as never);
  const reference = referenceFoldProject(sources, host);

  const hostSeed = new Set<string>();
  const compositeSeed = new Set<string>();
  const lexiconSeed = new Set<string>();
  for (const [key, source] of sources) {
    const { bare } = specifiersOf(source, key);
    if (bare.some((s) => !isChantOwnedSpecifier(s) || host.unloadable.has(s))) hostSeed.add(key);
    if (usesCompositeFactory(source, key, host)) compositeSeed.add(key);
    if (needsLexiconList(source, key, host)) lexiconSeed.add(key);
  }
  const hostLimited = spread(hostSeed, sources, reference.taintSource);
  const compositeLimited = spread(compositeSeed, sources, reference.taintSource);
  // A chant-side limit spreads along chant's own edges: a file chant tainted
  // from a lexicon-limited file is limited for the same reason.
  const chantTaint = new Map<string, string>();
  for (const [abs, v] of chant) if (v.taintedBy) chantTaint.set(keyOf(abs), keyOf(v.taintedBy.from));
  const lexiconLimited = spread(lexiconSeed, sources, chantTaint);

  const comparisons: FileComparison[] = paths.map((abs) => {
    const file = keyOf(abs);
    const cv = chant.get(abs);
    const rv = reference.verdicts.get(file);
    const chantSide: Side = cv?.verdict === "fold" ? "fold" : "run";
    const referenceSide: Side = rv?.kind === "fold" ? "fold" : "run";
    const limit: Limit | undefined = hostLimited.has(file)
      ? "host"
      : compositeLimited.has(file)
        ? "composite"
        : lexiconLimited.has(file)
          ? "lexicon-list"
          : entry.buildParams
            ? "build-params"
            : undefined;
    const chantLimit = lexiconLimited.has(file) ? "lexicon-list" : entry.buildParams ? "build-params" : undefined;
    const base: FileComparison = {
      file,
      chant: chantSide,
      reference: referenceSide,
      limit,
      chantLimit,
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
    return { ...base, values: compareData(left, right) };
  });
  return { name: entry.name, files: paths.length, comparisons };
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
   * A reference fold where chant runs, on every file where nothing disarmed
   * chant. A reference-side limit can only make the reference refuse more,
   * never less, so under one of those a fold the reference reaches and chant
   * does not has no benign explanation and is listed wherever it appears.
   */
  readonly referenceMorePermissive: readonly Disagreement[];
}

export function summarize(reports: readonly EntryReport[]): CorpusSummary {
  let files = 0, comparable = 0, comparableAgreed = 0, comparableBothFold = 0, comparableValuesNotData = 0;
  const limited: Record<Limit, number> = { host: 0, composite: 0, "build-params": 0, "lexicon-list": 0 };
  const disagreements: Disagreement[] = [];
  const referenceMorePermissive: Disagreement[] = [];
  for (const report of reports) {
    files += report.files;
    for (const c of report.comparisons) {
      if (c.reference === "fold" && c.chant === "run" && !c.chantLimit) {
        referenceMorePermissive.push({ ...c, entry: report.name });
      }
      if (c.limit) { limited[c.limit]++; continue; }
      comparable++;
      if (c.chant === c.reference && c.values !== "differ") comparableAgreed++;
      else disagreements.push({ ...c, entry: report.name });
      if (c.values === "equal") comparableBothFold++;
      if (c.values === "not-data") comparableValuesNotData++;
    }
  }
  return {
    entries: reports.length, files, comparable, comparableAgreed, comparableBothFold,
    comparableValuesNotData, limited, disagreements, referenceMorePermissive,
  };
}

/** The committed evidence artifact. Numbers here are produced by the run, never typed in. */
export function renderCorpusReport(
  checkout: ChantCheckout,
  engine: string,
  summary: CorpusSummary,
  reports: readonly EntryReport[],
): string {
  const rows = reports.map((r) => {
    const s = summarize([r]);
    return `| \`${r.name}\` | ${r.files} | ${s.comparable} | ${s.comparableAgreed} | ${s.limited.host} | ${s.limited.composite} | ${s.limited["lexicon-list"]} | ${s.limited["build-params"]} |`;
  });
  const line = (d: Disagreement) =>
    `- \`${d.entry}/${d.file}\`: chant ${d.chant}, reference ${d.reference}${d.values ? `, values ${d.values}` : ""}` +
    `${d.referenceReason ? ` — reference ${d.referenceRule}: ${d.referenceReason}` : ""}` +
    `${d.chantReason ? ` — chant: ${d.chantReason}` : ""}`;
  return [
    "# Corpus cross-check",
    "",
    "Generated by `npm run corpus` (#25). Do not edit.",
    "",
    `- engine under test: \`${engine}\``,
    `- corpus: chant \`${checkout.corpusVersion}\` at \`${checkout.revision}\`, ${summary.entries} entries, ${summary.files} files`,
    "",
    "## Totals",
    "",
    "| Files | Comparable | Agreed | Both fold | No host | No composite form | No lexicon list | Build params |",
    "|---|---|---|---|---|---|---|---|",
    `| ${summary.files} | ${summary.comparable} | ${summary.comparableAgreed} | ${summary.comparableBothFold} |` +
      ` ${summary.limited.host} | ${summary.limited.composite} | ${summary.limited["lexicon-list"]} | ${summary.limited["build-params"]} |`,
    "",
    "The first two limits disarm the reference; the last two disarm chant, whose whole-build entry takes neither a lexicon list nor build parameters.",
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
    "## Per entry",
    "",
    "| Entry | Files | Comparable | Agreed | No host | No composite form | No lexicon list | Build params |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}
