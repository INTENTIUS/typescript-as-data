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
}

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

export interface ConformanceAdapter {
  readonly name: string;
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
}
