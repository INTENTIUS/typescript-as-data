/**
 * The adapter an implementation under test provides. Deliberately narrow so a
 * foreign implementation (chant, or one in another language behind a shim)
 * can satisfy it without exposing internals: source in, verdict out.
 */
import type { ConformanceHost } from "./host.js";

export type ShapeResult =
  | { accepted: true }
  | { accepted: false; rule?: string; line: number; column: number; message: string }
  | "unavailable";
export type FoldResult =
  | { ok: true; value: unknown }
  | { ok: false; rule?: string; line: number; column: number; message: string };
/** A whole-build verdict (J2 + J3). `rule` and `reason` are diagnostic; only `kind` is compared. */
export type ProjectVerdict =
  | { kind: "fold"; exports: Record<string, unknown> }
  | { kind: "run"; rule?: string; reason: string };
export interface ProjectResult {
  verdicts: Record<string, ProjectVerdict>;
  /** J2's proposal, before J3 disposed of it. Omitted by an implementation that cannot separate the two phases. */
  tentative?: Record<string, "fold" | "run">;
  /** For a file J3 tainted, the file whose taint reached it. */
  taintedBy?: Record<string, string>;
  /** F-Obs-Counters, per build. Omitted by an implementation whose public entry exposes none. */
  counters?: ExecutionCounters;
  /**
   * F-Obs-Provenance (spec 2.2), from an adapter that declares
   * `provenance: true`: per file that folded, every emitted path to its
   * origin. A file absent here reported none, which is never read as `direct`.
   */
  provenance?: Record<string, FileProvenance>;
}

/**
 * F-Obs-Provenance's path: the export name, then the property path in the
 * folded value written as a TypeScript accessor would be: `.key` for an
 * identifier key, `["key"]` (JSON-quoted) for any other, `[n]` for an array
 * element. `bucket.props.tags["app.kubernetes.io/name"]`, `ports[0]`.
 *
 * Leaves are reported. An implementation may report a coarser path than a
 * leaf (chant attributes an array whole), and that origin then governs every
 * path under it: {@link originAt} resolves a path against its nearest
 * reported ancestor.
 */
export type ProvenancePath = string;

/** A position in the build's source, 1-based; `file` as the fixture names it. */
export interface SourceLocation { file: string; line: number; column: number }

/**
 * One emitted path's origin, in the four kinds spec 2.2 names. The shape
 * follows chant's `FoldFieldOrigin`, so chant maps onto it unchanged; the
 * source locations are optional additions.
 *
 * - `composite-parameter`: `composite` is the composite's (or project
 *   function's) export name, `parameters` the dotted parameter paths the value
 *   was read from, `call` where the call was written, `arguments` where each
 *   parameter's argument was written at that call.
 * - `composite-literal`: the composite's body fixes the value; `literal` is
 *   where.
 * - `unknown`: no attribution. `reason` is diagnostic and not compared.
 *
 * `instance` is the export a composite call initializes, when there is one.
 */
export type FieldOrigin =
  | { kind: "direct" }
  | {
      kind: "composite-parameter";
      composite: string;
      instance?: string;
      parameters: string[];
      call?: SourceLocation;
      arguments?: Record<string, SourceLocation>;
    }
  | { kind: "composite-literal"; composite: string; instance?: string; call?: SourceLocation; literal?: SourceLocation }
  | { kind: "unknown"; reason: string };

/** One file's provenance: path to origin. */
export type FileProvenance = Record<ProvenancePath, FieldOrigin>;

/**
 * The origin governing `path`: the entry for the path itself, or for its
 * nearest reported ancestor. Undefined when nothing covers it.
 */
export function originAt(file: FileProvenance, path: ProvenancePath): FieldOrigin | undefined {
  const cuts = [...path.matchAll(/\.[A-Za-z_$][\w$]*|\[\d+\]|\["(?:[^"\\]|\\.)*"\]/g)].map((m) => m.index);
  for (let i = cuts.length; i >= 0; i -= 1) {
    const p = i === cuts.length ? path : path.slice(0, cuts[i]);
    if (p in file) return file[p];
  }
  return undefined;
}

/**
 * F-Obs-Counters: in-process factory or constructor invocations while folding;
 * of those, how many resolved to project-owned code; and how many factory
 * bodies were interpreted instead. Three non-negative integers; the names
 * follow the reference and only the shape is normative.
 */
export interface ExecutionCounters { factoryInvocations: number; projectFactoryInvocations: number; factoryInterpretations: number }

/** F-Rule-Finding's closed severity set. */
export type Severity = "error" | "warning" | "info";
/** F-Rule-Phase: named by the input the rule reads, the folded namespace or the artifact. */
export type RulePhase = "pre" | "post";
/**
 * A finding, as data (F-Rule-Finding). `rule`, `severity` and `subject` are
 * compared; `message` is not (F-Obs-Messages); `at` only when the fixture
 * gives one and the implementation reports one (F-Obs-Provenance is
 * optional). `file` names the file whose namespace holds the subject for a
 * pre-synthesis finding; a post-synthesis finding concerns the artifact and
 * carries none.
 */
export interface Finding {
  rule: string;
  severity: Severity;
  subject: string;
  message: string;
  file?: string;
  at?: { line: number; column: number };
}

/** J2's ι (F-IsolatedRefusal): under `isolated`, no project code is invoked or imported on the fold path. */
/** J2's ι: `open` is the strict default, `isolated` refuses project-owned invocation, `executing` (spec 1.8) opts into invoking a declared project function whose body cannot fold. */
export type IsolationMode = "open" | "isolated" | "executing";

export interface ConformanceAdapter {
  readonly name: string;
  /**
   * F-Obs-Provenance is optional (spec 2.2). An adapter that sets this
   * returns `ProjectResult.provenance` for every build it folds; one that
   * does not has its provenance assertions reported as skipped.
   */
  readonly provenance?: boolean;
  /**
   * The specification version this implementation declares it implements,
   * as `spec/VERSION` spells it (`"1.0"`), or `"undeclared"`. Compared, never
   * assumed: the suite checks the reference's declaration against `VERSION`,
   * and reports an implementation that declares nothing as such (#18).
   */
  readonly specVersion: string;
  /** S-* verdict on the initializer of `exportName`. "unavailable" if the implementation exposes no shape classifier. */
  shape(source: string, exportName: string): ShapeResult;
  /** F-* verdict: fold the initializer of `exportName` to a JSON-comparable value, or a located rejection. */
  foldExport(source: string, exportName: string): FoldResult;
  /**
   * J2 + J3 over a whole build: every file's final verdict. Optional, and
   * "unavailable" when the implementation cannot answer — no whole-build
   * entry at all, or a host it has no way to install. Such a fixture is
   * reported skipped rather than silently passing.
   *
   * May be async: a real implementation resolves modules from a filesystem.
   */
  foldProject?(
    files: Map<string, string>,
    host?: ConformanceHost,
    mode?: IsolationMode,
  ): ProjectResult | "unavailable" | Promise<ProjectResult | "unavailable">;
  /**
   * The findings of the host's rules of one phase over the build (#101).
   * A rule is host code, so the harness carries only its identifier and its
   * findings; an implementation that cannot run a rule the host names
   * reports "unavailable" and the fixture is skipped visibly.
   */
  rules?(
    files: Map<string, string>,
    host: ConformanceHost,
    phase: RulePhase,
  ): Finding[] | "unavailable" | Promise<Finding[] | "unavailable">;
  /**
   * The round trip's generator (#80): source in the subset, as one module,
   * whose fold is `namespace` (export name to value, envelopes included).
   * "unavailable" for an implementation with no generator, or for a value it
   * has no form for; F-Val-Source says a form exists for every value.
   */
  generate?(namespace: Record<string, unknown>, host?: ConformanceHost): string | "unavailable";
}
