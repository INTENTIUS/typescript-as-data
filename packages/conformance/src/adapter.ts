/**
 * The adapter an implementation under test provides. Deliberately narrow so a
 * foreign implementation (chant, or one in another language behind a shim)
 * can satisfy it without exposing internals: source in, verdict out.
 */
import type { ConformanceHost } from "./host";

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
}
