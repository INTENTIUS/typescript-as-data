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
import type { ConformanceAdapter, Finding, IsolationMode, ProjectResult, ProjectVerdict, RulePhase, Severity } from "../adapter.js";
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
/** chant's post-synthesis engine, which is what runs the host's rules (#101). */
const runChecks = (
  chant as unknown as {
    runPostSynthChecks?: (
      checks: unknown[],
      buildResult: { outputs: Map<string, string>; entities: Map<string, unknown> },
    ) => Array<{ checkId: string; severity: string; message: string; entity?: string }>;
  }
).runPostSynthChecks;

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
      options?: { lexiconPackages?: readonly string[]; sandbox?: boolean },
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
async function foldOnDisk(
  files: Map<string, string>,
  host?: ConformanceHost,
  mode?: IsolationMode,
): Promise<ProjectResult> {
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

/**
 * The `shapes` host's two rules, as chant post-synthesis checks (#101, chant#2438).
 *
 * A rule is host code and the harness carries only its identifier, so an
 * implementation supplies the code. These are written against chant's own
 * `PostSynthCheck` contract and run through chant's own `runPostSynthChecks`,
 * because that engine is where the rules contract was extracted from. Writing
 * them against the fold output directly would re-implement the reference inside
 * the adapter, and `F-Rule-Equivalence` would then be comparing this file with
 * itself rather than two implementations.
 *
 * chant's engine has one phase where the specification has two, so the phase is
 * expressed in the input each check is given rather than in the engine: the
 * pre-synthesis rule is handed the folded namespace as `entities`, the
 * post-synthesis rule the serialized artifact as `outputs`. The runner asks for
 * each phase separately, so each gets a context built for it.
 */
interface ChantCheck {
  id: string;
  description: string;
  check(ctx: { entities: Map<string, unknown>; outputs: Map<string, string> }): Array<{
    checkId: string;
    severity: string;
    message: string;
    entity?: string;
  }>;
}

const isBucket = (v: unknown): v is { props?: Record<string, unknown> } =>
  typeof v === "object" && v !== null && (v as { entityType?: unknown }).entityType === "Bucket";

/**
 * The namespace a rule sees, with callables removed.
 *
 * A callable is never a value (`F-Val-Callable`) and never reaches a serializer
 * (`F-Val-Serializable`), so an exported function is not part of what a rule
 * reads. chant exports a project-local function as a `FoldableFunction` marker
 * carrying the AST it would interpret, so leaving them in also means the
 * post-synthesis artifact cannot be serialized at all.
 */
function ruleNamespace(exports: Record<string, unknown>): Map<string, unknown> {
  const isCallable = (chant as unknown as { isFoldableFunction?: (v: unknown) => boolean }).isFoldableFunction;
  return new Map(
    Object.entries(exports).filter(([, v]) => typeof v !== "function" && !(isCallable?.(v) ?? false)),
  );
}

function shapesChecks(severityOf: (id: string) => Severity): Record<RulePhase, ChantCheck> {
  return {
    pre: {
      id: "SHAPES001",
      description: "every Bucket declares a BucketName",
      check(ctx) {
        const out = [];
        for (const [name, value] of ctx.entities) {
          if (isBucket(value) && !(value.props && "BucketName" in value.props)) {
            out.push({
              checkId: "SHAPES001",
              severity: severityOf("SHAPES001"),
              message: `Bucket ${name} declares no BucketName`,
              entity: name,
            });
          }
        }
        return out;
      },
    },
    post: {
      id: "SHAPES002",
      description: "the artifact declares at least one Bucket",
      check(ctx) {
        // The artifact, not the namespace: this reads the serialized form, which
        // is what makes it a post-synthesis rule (F-Rule-Phase).
        const declaresBucket = [...ctx.outputs.values()].some((doc) => {
          const parsed = JSON.parse(doc) as Record<string, Record<string, unknown>>;
          return Object.values(parsed).some((exports) => Object.values(exports).some(isBucket));
        });
        return declaresBucket
          ? []
          : [
              {
                checkId: "SHAPES002",
                severity: severityOf("SHAPES002"),
                // Nothing to attach it to, so the subject states what is absent
                // (F-Rule-Finding, L11.5).
                message: "the artifact declares no Bucket",
                entity: "missing: Bucket",
              },
            ];
      },
    },
  };
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
  async foldProject(files, host, mode) {
    if (!projectFn) return "unavailable";
    // #2438 — a host used to make a fixture unanswerable here: its entity
    // classes come from a package chant's allowlist could not name, and the
    // entry took an intrinsic registry rather than a host. Both are addressed:
    // the host's packages are written next to the sources and named to chant
    // outright, and its registrations are translated. A chant too old for the
    // `lexiconPackages` option would resolve none of it, so say so rather than
    // report a wrong verdict.
    if (host && !(await acceptsHostPackages())) return "unavailable";
    // tsad#113 — chant has no mode that means `isolated`.
    //
    // Its nearest thing is `--sandbox` (chant#1093), and it is not the same
    // rule. Isolated refuses to INVOKE, so F-Call step 5 fires and step 6 never
    // imports; interpretation is untouched, which is why the positive cases of
    // S-FactoryBody and S-FactoryParams still fold. chant's sandbox refuses to
    // import project code at all, so it takes the interpretable factories down
    // with the rest: wiring the two together makes the four negatives agree and
    // breaks `good.ts` and `named.ts`, reference `fold` against chant `run`.
    //
    // Trading one disagreement for another is not honouring the mode. The
    // contract says an adapter that cannot answer in the mode asked for says
    // so, so this skips visibly rather than folding in the other mode and
    // reporting a verdict nobody asked for.
    if (mode === "isolated") return "unavailable";
    return foldOnDisk(files, host, mode);
  },

  async rules(files, host, phase) {
    if (!projectFn || !runChecks) return "unavailable";
    if (!(await acceptsHostPackages())) return "unavailable";

    // Every rule the host names must be one this implementation carries, and at
    // the phase the host declared. A host naming a rule chant has no code for
    // is reported unavailable and the fixture is skipped visibly, rather than
    // answered with a silence that would read as "no findings".
    const declared = host.rules ?? [];
    if (declared.length === 0) return "unavailable";
    const checks = shapesChecks((id) => declared.find((r) => r.id === id)?.severity ?? "error");
    if (!declared.every((r) => checks[r.phase]?.id === r.id)) return "unavailable";

    const folded = await foldOnDisk(files, host);
    const wanted = declared.filter((r) => r.phase === phase);
    if (wanted.length === 0) return [];

    const out: Finding[] = [];
    for (const rule of wanted) {
      const check = checks[rule.phase];
      // A file that ran has no folded namespace, so no rule sees it
      // (F-Rule-Input). Pre runs per file, so a finding carries the file whose
      // namespace holds its subject; post reads one artifact over the whole
      // build and carries none.
      const folds = Object.entries(folded.verdicts).filter(([, v]) => v.kind === "fold");
      if (phase === "pre") {
        for (const [file, verdict] of folds) {
          const entities = ruleNamespace((verdict as { exports: Record<string, unknown> }).exports);
          for (const d of runChecks([check as never], { outputs: new Map(), entities } as never)) {
            out.push({ rule: d.checkId, severity: d.severity as Severity, subject: d.entity ?? "", message: d.message, file });
          }
        }
        continue;
      }
      const artifact = Object.fromEntries(
        folds.map(([file, v]) => [file, Object.fromEntries(ruleNamespace((v as { exports: Record<string, unknown> }).exports))]),
      );
      const outputs = new Map([["artifact", JSON.stringify(artifact)]]);
      for (const d of runChecks([check as never], { outputs, entities: new Map() } as never)) {
        out.push({ rule: d.checkId, severity: d.severity as Severity, subject: d.entity ?? "", message: d.message });
      }
    }
    return out;
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
