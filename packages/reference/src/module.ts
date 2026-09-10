/** F-Bind + per-export evaluation over a parsed module. Diagnostic granularity (per export), like chant's foldModule. */
import * as ts from "typescript";
import { EMPTY_HOST, type Host } from "./host";
import { findShapeViolation, type ShapeViolation } from "./shape";
import { foldExpr, FoldRejection, type Scope } from "./fold";

export function parse(source: string, fileName = "fixture.ts"): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
}
export function collectConsts(sf: ts.SourceFile): Map<string, ts.Expression> {                  // F-Bind
  const m = new Map<string, ts.Expression>();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || (st.declarationList.flags & ts.NodeFlags.Const) === 0) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) m.set(d.name.text, d.initializer);
  }
  return m;
}
export function exportInitializer(sf: ts.SourceFile, name: string): ts.Expression | undefined {
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !st.modifiers?.some((x) => x.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return d.initializer;
  }
  return undefined;
}
export function shapeOfExport(source: string, name: string, host: Host = EMPTY_HOST): ShapeViolation | undefined | "no-such-export" {
  const sf = parse(source); const init = exportInitializer(sf, name);
  if (!init) return "no-such-export";
  return findShapeViolation(init, host);
}
export function foldExport(source: string, name: string, host: Host = EMPTY_HOST, externals: ReadonlyMap<string, unknown> = new Map()): { ok: true; value: unknown } | { ok: false; rule: string; line: number; column: number; message: string } {
  const sf = parse(source); const init = exportInitializer(sf, name);
  if (!init) return { ok: false, rule: "S-Module", line: 1, column: 1, message: `no export named ${name}` };
  const scope: Scope = { consts: collectConsts(sf), externals, depth: 0 };
  try { return { ok: true, value: foldExpr(init, scope, host) }; }
  catch (e) { if (e instanceof FoldRejection) return { ok: false, rule: e.rule, line: e.line, column: e.column, message: e.message }; throw e; }
}
