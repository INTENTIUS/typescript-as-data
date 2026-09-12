import * as ts from "typescript";
import { foldExpr, collectConsts, collectLocalFunctions, FoldRejection } from "./fold.js";
import { findShapeViolation, type ShapeViolation } from "./subset.js";
import { registerHelpers, registerHostSpecifiers } from "./foldable-helpers.js";
import { EMPTY_HOST, type Host } from "./host.js";

export function installHost(host: Host): void { registerHelpers(host.helpers); registerHostSpecifiers(host.ownedSpecifierPrefixes); }
export function parse(source: string, fileName = "fixture.ts"): ts.SourceFile { return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true); }
export function exportInitializer(sf: ts.SourceFile, name: string, admitDefault = false): ts.Expression | undefined {
  for (const st of sf.statements) {
    // S-ExportDefault: `export default ⟨Expr⟩` is the export named `default`, in data-host.
    if (name === "default" && admitDefault && ts.isExportAssignment(st) && !st.isExportEquals) return st.expression;
    if (!ts.isVariableStatement(st) || !st.modifiers?.some((x) => x.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return d.initializer;
  }
  return undefined;
}
/** S-CallLocal's callee set: names this file binds by S-LocalFunction or imports from a project specifier. Syntax only. */
export function localCallees(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.body) names.add(st.name.text);
    if (ts.isVariableStatement(st) && (st.declarationList.flags & ts.NodeFlags.Const) !== 0) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) names.add(d.name.text);
      }
    }
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && /^\.{1,2}\//.test(st.moduleSpecifier.text) && st.importClause && !st.importClause.isTypeOnly) {
      const c = st.importClause;
      if (c.name) names.add(c.name.text);
      if (c.namedBindings && ts.isNamedImports(c.namedBindings)) for (const el of c.namedBindings.elements) if (!el.isTypeOnly) names.add(el.name.text);
    }
  }
  return names;
}

export function shapeOfExport(source: string, name: string, host: Host = EMPTY_HOST): ShapeViolation | undefined | "no-such-export" {
  installHost(host); const sf = parse(source); const init = exportInitializer(sf, name, host.profile === "data-host");
  if (!init) return "no-such-export";
  return findShapeViolation(init, host.intrinsics, localCallees(sf));
}
export function foldExport(source: string, name: string, host: Host = EMPTY_HOST, externals: ReadonlyMap<string, unknown> = new Map(), fileName = "fixture.ts"): { ok: true; value: unknown } | { ok: false; rule: string; line: number; column: number; message: string } {
  installHost(host); const sf = parse(source, fileName); const init = exportInitializer(sf, name, host.profile === "data-host");
  if (!init) return { ok: false, rule: "S-Module", line: 1, column: 1, message: `no export named ${name}` };
  // F-Bind at the expression level: the file's own functions are bound so a
  // same-file call folds here the way it does in a build.
  const consts = collectConsts(sf);
  const bound = new Map<string, unknown>(externals);
  for (const fn of collectLocalFunctions(sf, fileName, consts, bound)) bound.set(fn.name, fn);
  try { return { ok: true, value: foldExpr(init, { consts, externals: bound, depth: 0 }, { intrinsics: host.intrinsics }) }; }
  catch (e) { if (e instanceof FoldRejection) return { ok: false, rule: e.rule, line: e.line, column: e.column, message: e.message }; throw e; }
}
