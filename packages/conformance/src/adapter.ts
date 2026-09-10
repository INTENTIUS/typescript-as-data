/**
 * The adapter an implementation under test provides. Deliberately narrow so a
 * foreign implementation (chant, or one in another language behind a shim)
 * can satisfy it without exposing internals: source in, verdict out.
 */
export type ShapeResult =
  | { accepted: true }
  | { accepted: false; rule?: string; line: number; column: number; message: string }
  | "unavailable";
export type FoldResult =
  | { ok: true; value: unknown }
  | { ok: false; rule?: string; line: number; column: number; message: string };
export interface ConformanceAdapter {
  readonly name: string;
  /** S-* verdict on the initializer of `exportName`. "unavailable" if the implementation exposes no shape classifier. */
  shape(source: string, exportName: string): ShapeResult;
  /** F-* verdict: fold the initializer of `exportName` to a JSON-comparable value, or a located rejection. */
  foldExport(source: string, exportName: string): FoldResult;
}
