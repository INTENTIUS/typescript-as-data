/**
 * S-FnBody, grammar.md §3: the statement sub-grammar a project-local function
 * must satisfy before J1's F-Eval-CallLocal will evaluate it.
 */
import * as ts from "typescript";

export type FnDecl = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

/** A binding element the sub-grammar admits: `{ a }` or `{ a: b }`, nothing else. */
export function plainBindingKey(el: ts.BindingElement): string | undefined {
  if (el.dotDotDotToken || el.initializer || !ts.isIdentifier(el.name)) return undefined;
  const key = el.propertyName ?? el.name;
  return ts.isIdentifier(key) || ts.isStringLiteral(key) || ts.isNumericLiteral(key) ? key.text : undefined;
}

/** A reason the function is outside S-FnBody, or undefined when it is admissible. */
export function findFnBodyViolation(fn: FnDecl): string | undefined {
  if (fn.asteriskToken) return "a generator function is not foldable";
  if (fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) return "an async function is not foldable";
  if (!fn.body) return "a function without a body is not foldable";

  for (const p of fn.parameters) {
    if (p.dotDotDotToken) return "a rest parameter is not foldable";
    if (ts.isIdentifier(p.name)) continue;
    if (ts.isObjectBindingPattern(p.name)) {
      for (const el of p.name.elements) {
        if (plainBindingKey(el) === undefined) return "a destructured parameter with a rest, default, or nested element is not foldable";
      }
      continue;
    }
    return "an array-destructured parameter is not foldable";
  }

  if (!ts.isBlock(fn.body)) return undefined; // a concise expression body

  const statements = fn.body.statements;
  for (let i = 0; i < statements.length; i += 1) {
    const st = statements[i];
    const last = i === statements.length - 1;
    if (ts.isReturnStatement(st)) {
      if (!last) return "an early `return` is not foldable";
      continue;
    }
    if (!ts.isVariableStatement(st)) {
      return `\`${ts.SyntaxKind[st.kind]}\` in a function body is not foldable, only \`const\` declarations and a final \`return\` are`;
    }
    if ((st.declarationList.flags & ts.NodeFlags.Const) === 0) return "`let`/`var` in a function body is not foldable";
    for (const d of st.declarationList.declarations) {
      if (!d.initializer) return "an uninitialized `const` in a function body is not foldable";
      if (ts.isIdentifier(d.name)) continue;
      if (ts.isObjectBindingPattern(d.name)) {
        for (const el of d.name.elements) {
          if (plainBindingKey(el) === undefined) return "a destructured `const` with a rest, default, or nested element is not foldable";
        }
        continue;
      }
      return "an array-destructured `const` in a function body is not foldable";
    }
  }
  return undefined;
}
