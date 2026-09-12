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
import { relative, resolve, dirname, posix } from "node:path";
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
  /** The lexicon names the entry's own config declares: F-Host-Trust arm 1's active set, which chant's entry takes since chant#2422. */
  readonly lexicons: readonly string[];
  /** The entry's build parameters, resolved the way the CLI resolves them, so a file reading `params.<name>` folds on chant's side. */
  readonly buildParams: Readonly<Record<string, string | number | boolean>>;
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
  /** The reference implements no composite factory form; see `packages/reference/CAVEATS.md`. */
  | "composite";

/**
 * Both limits disarm the reference, and a limit can only make its own side
 * refuse more. Two chant-side limits used to sit here, for a lexicon list and
 * build parameters chant's entry could not be given; chant-v0.71.0 takes both
 * (chant#2422) and they are gone (#96).
 */
export const LIMIT_SIDE: Readonly<Record<Limit, "reference">> = { host: "reference", composite: "reference" };

export interface FileComparison {
  readonly file: string;
  readonly chant: Side;
  readonly reference: Side;
  /** The first limit that applies, for the comparable-set accounting. */
  readonly limit?: Limit;
  /** Both folded, and their export namespaces were compared as data. */
  readonly values?: "equal" | "differ" | "not-data";
  /** Where the two encodings first differ, with a little context either side, so a difference is a diff and not a verdict. */
  readonly valuesDiff?: string;
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

/** Run one corpus entry through both implementations and classify every file. */
export async function runCorpusEntry(checkout: ChantCheckout, entry: CorpusEntry): Promise<EntryReport> {
  const paths = await findInfraFiles(entry.srcDir);
  const keyOf = (abs: string) => relative(entry.srcDir, abs).split("\\").join("/");
  const sources = new Map(paths.map((p) => [keyOf(p), readFileSync(p, "utf8")]));

  const host = await buildHost(checkout, entry, sources);
  const chant = await chantFoldProject(paths, entry.intrinsics as never, { lexicons: entry.lexicons, buildParams: entry.buildParams });
  const reference = referenceFoldProject(sources, host);

  const hostSeed = new Set<string>();
  const compositeSeed = new Set<string>();
  for (const [key, source] of sources) {
    const { bare } = specifiersOf(source, key);
    if (bare.some((s) => !isChantOwnedSpecifier(s) || host.unloadable.has(s))) hostSeed.add(key);
    if (usesCompositeFactory(source, key, host)) compositeSeed.add(key);
  }
  const hostLimited = spread(hostSeed, sources, reference.taintSource);
  const compositeLimited = spread(compositeSeed, sources, reference.taintSource);

  const comparisons: FileComparison[] = paths.map((abs) => {
    const file = keyOf(abs);
    const cv = chant.get(abs);
    const rv = reference.verdicts.get(file);
    const chantSide: Side = cv?.verdict === "fold" ? "fold" : "run";
    const referenceSide: Side = rv?.kind === "fold" ? "fold" : "run";
    const limit: Limit | undefined = hostLimited.has(file) ? "host" : compositeLimited.has(file) ? "composite" : undefined;
    const base: FileComparison = {
      file,
      chant: chantSide,
      reference: referenceSide,
      limit,
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
   * A reference fold where chant runs, anywhere in the corpus. Both limits are
   * the reference's and can only make it refuse more, never less, so a fold it
   * reaches and chant does not has no benign explanation wherever it appears.
   */
  readonly referenceMorePermissive: readonly Disagreement[];
}

export function summarize(reports: readonly EntryReport[]): CorpusSummary {
  let files = 0, comparable = 0, comparableAgreed = 0, comparableBothFold = 0, comparableValuesNotData = 0;
  const limited: Record<Limit, number> = { host: 0, composite: 0 };
  const disagreements: Disagreement[] = [];
  const referenceMorePermissive: Disagreement[] = [];
  for (const report of reports) {
    files += report.files;
    for (const c of report.comparisons) {
      if (c.reference === "fold" && c.chant === "run") referenceMorePermissive.push({ ...c, entry: report.name });
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
  engine: { name: string; specVersion: string },
  summary: CorpusSummary,
  reports: readonly EntryReport[],
): string {
  const rows = reports.map((r) => {
    const s = summarize([r]);
    return `| \`${r.name}\` | ${r.files} | ${s.comparable} | ${s.comparableAgreed} | ${s.limited.host} | ${s.limited.composite} |`;
  });
  const line = (d: Disagreement) =>
    `- \`${d.entry}/${d.file}\`: chant ${d.chant}, reference ${d.reference}${d.values ? `, values ${d.values}` : ""}${d.valuesDiff ? ` (${d.valuesDiff})` : ""}` +
    `${d.referenceReason ? ` — reference ${d.referenceRule}: ${d.referenceReason}` : ""}` +
    `${d.chantReason ? ` — chant: ${d.chantReason}` : ""}`;
  return [
    "# Corpus cross-check",
    "",
    "Generated by `npm run corpus` (#25). Do not edit.",
    "",
    `- engine under test: \`${engine.name}\`, declaring spec \`${engine.specVersion}\``,
    `- corpus: chant \`${checkout.corpusVersion}\` at \`${checkout.revision}\`, ${summary.entries} entries, ${summary.files} files`,
    "",
    "## Totals",
    "",
    "| Files | Comparable | Agreed | Both fold | No host | No composite form |",
    "|---|---|---|---|---|---|",
    `| ${summary.files} | ${summary.comparable} | ${summary.comparableAgreed} | ${summary.comparableBothFold} |` +
      ` ${summary.limited.host} | ${summary.limited.composite} |`,
    "",
    "Both limits disarm the reference. chant is given the entry's lexicons and build parameters, the inputs a real build has.",
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
    "| Entry | Files | Comparable | Agreed | No host | No composite form |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}
