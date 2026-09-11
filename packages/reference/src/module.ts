import * as ts from "typescript";
import { fold, collectConsts, FoldError } from "./fold";
import { findSubsetViolation, type SubsetViolation } from "./subset";
import { registerHelpers, registerHostSpecifiers } from "./foldable-helpers";
import { EMPTY_HOST, type Host } from "./host";

export function installHost(host: Host): void { registerHelpers(host.helpers); registerHostSpecifiers(host.ownedSpecifierPrefixes); }
export function parse(source: string, fileName = "fixture.ts"): ts.SourceFile { return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true); }
export function exportInitializer(sf: ts.SourceFile, name: string): ts.Expression | undefined {
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !st.modifiers?.some((x) => x.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return d.initializer;
  }
  return undefined;
}
export function shapeOfExport(source: string, name: string, host: Host = EMPTY_HOST): SubsetViolation | undefined | "no-such-export" {
  installHost(host); const sf = parse(source); const init = exportInitializer(sf, name);
  if (!init) return "no-such-export";
  return findSubsetViolation(init, host.intrinsics);
}
export function foldExport(source: string, name: string, host: Host = EMPTY_HOST, externals: ReadonlyMap<string, unknown> = new Map()): { ok: true; value: unknown } | { ok: false; rule: string; line: number; column: number; message: string } {
  installHost(host); const sf = parse(source); const init = exportInitializer(sf, name);
  if (!init) return { ok: false, rule: "S-Module", line: 1, column: 1, message: `no export named ${name}` };
  try { return { ok: true, value: fold(init, collectConsts(sf), host.intrinsics, externals) }; }
  catch (e) { if (e instanceof FoldError) return { ok: false, rule: e.ruleId, line: e.line, column: e.column, message: e.message }; throw e; }
}
