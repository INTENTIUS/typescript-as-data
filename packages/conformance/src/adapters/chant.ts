/**
 * #11 — chant as an implementation under test, through its PUBLIC entry only:
 * `fold`, `collectConsts`, `FoldError`, and — since chant-v0.64.0 (chant#2362)
 * — `findSubsetViolation` for the shape half. If an older chant is pinned the
 * adapter reports shape "unavailable" rather than guessing.
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import * as ts from "typescript";
import * as chant from "@intentius/chant";
import type { ConformanceAdapter, ProjectResult, ProjectVerdict } from "../adapter.js";
import type { ConformanceHost } from "../host.js";

function exportInitializer(sf: ts.SourceFile, name: string): ts.Expression | undefined {
  for (const st of sf.statements) {
    if (name === "default" && ts.isExportAssignment(st) && !st.isExportEquals) return st.expression;
    if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return d.initializer;
  }
  return undefined;
}
const parse = (src: string) => ts.createSourceFile("fixture.ts", src, ts.ScriptTarget.Latest, true);
function chantVersion(): string {
  const declared = (chant as unknown as { VERSION?: string }).VERSION;
  if (typeof declared === "string") return declared;
  // The package does not export its own manifest, so walk up from the resolved
  // entry to the nearest one.
  let dir = dirname(createRequire(import.meta.url).resolve("@intentius/chant"));
  for (;;) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      const version = (JSON.parse(readFileSync(candidate, "utf8")) as { version?: string }).version;
      if (typeof version === "string") return version;
    }
    const up = dirname(dir);
    if (up === dir) throw new Error("cannot determine the pinned chant version");
    dir = up;
  }
}

const shapeFn = (chant as unknown as { findSubsetViolation?: (n: ts.Node) => { node: ts.Node; ruleId: string; message: string } | undefined }).findSubsetViolation;

/**
 * The whole-build entry, chant-v0.70.1+ (chant#2408). Absent on an older pin,
 * in which case the project fixtures report "unavailable" rather than passing
 * vacuously.
 */
type ChantVerdict = {
  verdict: "fold" | "run";
  tentative: "fold" | "run";
  reason?: string;
  taintedBy?: { from: string; kind: "importer" | "capture" };
  exports?: ReadonlyMap<string, unknown>;
};
/**
 * Whether the pinned chant takes `FoldProjectOptions.lexiconPackages`
 * (chant#2438).
 *
 * Probed, not inferred from a version string. An older pin ignores an unknown
 * option silently, so every hosted fixture would come back `run` and read as a
 * real disagreement rather than as a missing feature. The probe is the smallest
 * possible instance of the thing itself: one file importing one generated
 * package. Memoized, since every hosted fixture asks.
 */
let hostPackageSupport: Promise<boolean> | undefined;

function acceptsHostPackages(): Promise<boolean> {
  hostPackageSupport ??= (async () => {
    if (!projectFn) return false;
    const root = mkdtempSync(join(tmpdir(), "tsad-probe-"));
    try {
      const dir = join(root, "node_modules", "@tsad", "probe");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "@tsad/probe", version: "0.0.0", type: "module", main: "index.js" }),
        "utf8",
      );
      writeFileSync(join(dir, "index.js"), "export const PROBE = 1;\n", "utf8");
      const file = join(root, "probe.ts");
      writeFileSync(file, 'import { PROBE } from "@tsad/probe";\nexport const p = PROBE;\n', "utf8");
      const verdicts = await projectFn([file], [], { lexiconPackages: ["@tsad/probe"] });
      return verdicts.get(file)?.verdict === "fold";
    } catch {
      return false;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  })();
  return hostPackageSupport;
}

const projectFn = (
  chant as unknown as {
    foldProject?: (
      files: readonly string[],
      intrinsics?: readonly unknown[],
      options?: { lexiconPackages?: readonly string[] },
    ) => Promise<Map<string, ChantVerdict>>;
  }
).foldProject;

/**
 * The key a generated host package reads its values back out of (#2438).
 *
 * A host's values are live JavaScript — classes revival must `new`, functions
 * it must call — so the package written next to a fixture cannot be their
 * source. It reads them off the process instead, which is sound because chant
 * imports it in this same process.
 */
const HOST_VALUES = Symbol.for("tsad.conformance.hostValues");

/**
 * Write the host's packages into `root/node_modules`, so chant's own module
 * resolution finds them from the fixture sources (#2438).
 *
 * Returns the specifiers written, which is what chant has to be told to follow
 * a bare import into: its allowlist is `@intentius/chant-lexicon-*` unless a
 * caller names a package outright, and `@tsad/shapes` is not that shape.
 */
function installHost(root: string, host: ConformanceHost): string[] {
  const globals = (globalThis as Record<symbol, unknown>)[HOST_VALUES] as
    | Map<string, ReadonlyMap<string, unknown>>
    | undefined;
  const registry = globals ?? new Map<string, ReadonlyMap<string, unknown>>();
  (globalThis as Record<symbol, unknown>)[HOST_VALUES] = registry;

  const specifiers: string[] = [];
  for (const [specifier, values] of host.values) {
    registry.set(specifier, values);
    const dir = join(root, "node_modules", ...specifier.split("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: specifier, version: "0.0.0", type: "module", main: "index.js" }),
      "utf8",
    );
    // One binding per export, read back from the process. `export const` with a
    // computed initializer is still a static export, so a named import of it
    // resolves exactly as it would from a hand-written module.
    const lines = [
      `const values = globalThis[Symbol.for(${JSON.stringify("tsad.conformance.hostValues")})].get(${JSON.stringify(specifier)});`,
      ...[...values.keys()].map((name) => `export const ${name} = values.get(${JSON.stringify(name)});`),
    ];
    writeFileSync(join(dir, "index.js"), lines.join("\n") + "\n", "utf8");
    specifiers.push(specifier);
  }
  return specifiers;
}

/** The host's registered intrinsics, in chant's own `IntrinsicDef` shape (#2438). */
function hostIntrinsics(host: ConformanceHost): unknown[] {
  return host.intrinsics.map((i) => ({
    name: i.name,
    isTag: i.isTag,
    ...(i.foldsAsCall ? { foldsAsCall: true } : {}),
    ...(i.foldsEagerly ? { foldsEagerly: true } : {}),
    ...(i.outputKey ? { outputKey: i.outputKey } : {}),
  }));
}

/** chant resolves modules from disk, so a fixture's sources are written out and the paths handed over. */
async function foldOnDisk(files: Map<string, string>, host?: ConformanceHost): Promise<ProjectResult> {
  const root = mkdtempSync(join(tmpdir(), "tsad-conformance-"));
  try {
    const paths: string[] = [];
    for (const [rel, source] of files) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, source, "utf8");
      paths.push(abs);
    }
    const lexiconPackages = host ? installHost(root, host) : [];
    const verdicts = await projectFn!(paths, host ? hostIntrinsics(host) : [], { lexiconPackages });
    const out: ProjectResult = { verdicts: {}, tentative: {}, taintedBy: {} };
    const relOf = (abs: string) => abs.slice(root.length + 1).split(/[\\/]/).join("/");
    for (const [abs, v] of verdicts) {
      const key = relOf(abs);
      out.verdicts[key] =
        v.verdict === "fold"
          ? ({ kind: "fold", exports: Object.fromEntries(v.exports ?? new Map()) } as ProjectVerdict)
          : ({ kind: "run", reason: v.reason ?? "tainted" } as ProjectVerdict);
      out.tentative![key] = v.tentative;
      if (v.taintedBy) out.taintedBy![key] = relOf(v.taintedBy.from);
    }
    return out;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export const chantAdapter: ConformanceAdapter = {
  // Read from the installed package, never a literal: a hardcoded fallback
  // silently misreports the pin, and this name is what the paper's measurement
  // table cites.
  name: `chant@${chantVersion()}`,
  // chant declares the specification version it implements in its own tree
  // once it does so at all; a pin that exports none is reported as undeclared
  // rather than assumed current (#18).
  specVersion: (chant as unknown as { SPEC_VERSION?: string }).SPEC_VERSION ?? "undeclared",
  shape(source, exportName) {
    if (!shapeFn) return "unavailable";
    const sf = parse(source); const init = exportInitializer(sf, exportName);
    if (!init) return { accepted: false, line: 1, column: 1, message: `no export named ${exportName}` };
    const v = shapeFn(init); if (!v) return { accepted: true };
    const { line, character } = sf.getLineAndCharacterOfPosition(v.node.getStart());
    return { accepted: false, rule: v.ruleId, line: line + 1, column: character + 1, message: v.message };
  },
  async foldProject(files, host) {
    if (!projectFn) return "unavailable";
    // #2438 — a host used to make a fixture unanswerable here: its entity
    // classes come from a package chant's allowlist could not name, and the
    // entry took an intrinsic registry rather than a host. Both are addressed:
    // the host's packages are written next to the sources and named to chant
    // outright, and its registrations are translated. A chant too old for the
    // `lexiconPackages` option would resolve none of it, so say so rather than
    // report a wrong verdict.
    if (host && !(await acceptsHostPackages())) return "unavailable";
    return foldOnDisk(files, host);
  },
  foldExport(source, exportName) {
    const sf = parse(source); const init = exportInitializer(sf, exportName);
    if (!init) return { ok: false, line: 1, column: 1, message: `no export named ${exportName}` };
    try { return { ok: true, value: chant.fold(init, chant.collectConsts(sf), [], undefined) }; }
    catch (e) {
      if (e instanceof chant.FoldError) return { ok: false, rule: e.ruleId, line: e.line, column: e.column, message: e.message };
      throw e;
    }
  },
};
