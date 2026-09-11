/**
 * #11 — chant as an implementation under test, through its PUBLIC entry only:
 * `fold`, `collectConsts`, `FoldError`, and — since chant-v0.64.0 (chant#2362)
 * — `findSubsetViolation` for the shape half. If an older chant is pinned the
 * adapter reports shape "unavailable" rather than guessing.
 */
import * as ts from "typescript";
import * as chant from "@intentius/chant";
import type { ConformanceAdapter } from "../adapter";

function exportInitializer(sf: ts.SourceFile, name: string): ts.Expression | undefined {
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return d.initializer;
  }
  return undefined;
}
const parse = (src: string) => ts.createSourceFile("fixture.ts", src, ts.ScriptTarget.Latest, true);
const shapeFn = (chant as unknown as { findSubsetViolation?: (n: ts.Node) => { node: ts.Node; ruleId: string; message: string } | undefined }).findSubsetViolation;

export const chantAdapter: ConformanceAdapter = {
  name: `chant@${(chant as unknown as { VERSION?: string }).VERSION ?? "0.68.1"}`,
  shape(source, exportName) {
    if (!shapeFn) return "unavailable";
    const sf = parse(source); const init = exportInitializer(sf, exportName);
    if (!init) return { accepted: false, line: 1, column: 1, message: `no export named ${exportName}` };
    const v = shapeFn(init); if (!v) return { accepted: true };
    const { line, character } = sf.getLineAndCharacterOfPosition(v.node.getStart());
    return { accepted: false, rule: v.ruleId, line: line + 1, column: character + 1, message: v.message };
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
