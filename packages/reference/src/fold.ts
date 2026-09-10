/**
 * Expression evaluation — judgments.md J1, one F-Eval-* rule per branch.
 * The walking-skeleton subset: literals, identifiers, templates, objects,
 * arrays, member/index, unary, binary, conditional. Everything else is a
 * located rejection naming the rule. Executes nothing.
 */
import * as ts from "typescript";
import type { Host } from "./host";

export class FoldRejection extends Error {
  constructor(readonly rule: string, readonly line: number, readonly column: number, message: string) {
    super(`${line}:${column} - ${message}`);
  }
}
export type Scope = { consts: Map<string, ts.Expression>; externals: ReadonlyMap<string, unknown>; depth: number };
const CHAIN = Symbol("chain-short-circuit");

function locate(n: ts.Node) { const { line, character } = n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()); return { line: line + 1, column: character + 1 }; }
function reject(rule: string, n: ts.Node, msg: string): never { const { line, column } = locate(n); throw new FoldRejection(rule, line, column, msg); }
const isEnvelope = (x: unknown) => typeof x === "object" && x !== null && !Array.isArray(x) &&
  ["__attrRef", "__intrinsic", "__helper", "__resource", "__compositeStep", "__symbol"].some((k) => k in (x as object));
function continuesChain(n: ts.Node): boolean {
  const p = n.parent; if (!p) return false;
  if (ts.isNonNullExpression(p) && ts.isOptionalChain(p)) return continuesChain(p);
  return (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p) || ts.isCallExpression(p)) && p.expression === n && ts.isOptionalChain(p);
}

export function foldExpr(node: ts.Expression, scope: Scope, host: Host): unknown {
  const F = (n: ts.Expression) => foldExpr(n, scope, host);
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) return F(node.expression); // F-Eval-Unwrap
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) reject("F-Eval-Function", node, "a function used as a value is not foldable");
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;         // F-Eval-Literal
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node)) {                                                                        // F-Eval-Ident
    if (node.text === "undefined") return undefined;                                                   // F-Eval-Undefined
    const init = scope.consts.get(node.text);
    if (init !== undefined) {
      if (ts.isNewExpression(init)) {
        if (scope.externals.has(node.text)) return scope.externals.get(node.text);
        reject("F-Eval-Ident", node, `same-file resource \`${node.text}\` used as a value is not foldable`);
      }
      return F(init);
    }
    if (scope.externals.has(node.text)) return scope.externals.get(node.text);
    if (node.text === "process") reject("F-Eval-Ident", node, 'ambient "process" read is not foldable — declare a build-time parameter instead');
    reject("F-Eval-Ident", node, `unresolved identifier: ${node.text}`);
  }
  if (ts.isTemplateExpression(node)) {                                                                // F-Eval-Template
    let out = node.head.text;
    for (const span of node.templateSpans) {
      const x = F(span.expression);
      if (isEnvelope(x)) reject("F-Eval-Template", span.expression, "a symbolic value inside a plain template span is not foldable (use the intrinsic form)");
      out += String(x) + span.literal.text;
    }
    return out;
  }
  if (ts.isTaggedTemplateExpression(node)) reject("F-Eval-Tagged", node, "tagged templates are not implemented in the walking skeleton");
  if (ts.isObjectLiteralExpression(node)) {                                                           // F-Eval-Object
    const obj: Record<string, unknown> = {};
    for (const p of node.properties) {
      if (ts.isPropertyAssignment(p)) {
        if (!(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name))) reject("F-Eval-Object", p.name, "computed property name");
        obj[p.name.text] = F(p.initializer);
      } else if (ts.isShorthandPropertyAssignment(p)) obj[p.name.text] = F(p.name);
      else if (ts.isSpreadAssignment(p)) { const s = F(p.expression); if (s === null || typeof s !== "object") reject("F-Eval-Object", p, "spread source not an object"); Object.assign(obj, s); }
      else reject("F-Eval-Object", p, "unsupported object member");
    }
    return obj;
  }
  if (ts.isArrayLiteralExpression(node)) {                                                            // F-Eval-Array
    const arr: unknown[] = [];
    for (const el of node.elements) {
      if (ts.isSpreadElement(el)) { const s = F(el.expression); if (!Array.isArray(s)) reject("F-Eval-Array", el, "spread source not an array"); arr.push(...s); }
      else arr.push(F(el));
    }
    return arr;
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {                   // F-Eval-Member / F-Eval-Index
    let key: string;
    if (ts.isPropertyAccessExpression(node)) key = node.name.text;
    else { const k = node.argumentExpression; if (!ts.isStringLiteral(k) && !ts.isNumericLiteral(k)) reject("F-Eval-Index", k, "dynamic element-access key"); key = k.text; }
    if (ts.isIdentifier(node.expression)) { const init = scope.consts.get(node.expression.text); if (init && ts.isNewExpression(init)) return { __attrRef: { entity: node.expression.text, attribute: key } }; } // step 1
    const x = F(node.expression);
    if ((x as unknown) === CHAIN) return continuesChain(node) ? CHAIN : undefined;                     // step 3
    if (x === null || x === undefined) {                                                              // step 4
      if (node.questionDotToken) return continuesChain(node) ? CHAIN : undefined;
      reject("F-Eval-Member", node, `property "${key}" read on ${String(x)} is not foldable — running this expression throws`);
    }
    if (isEnvelope(x) && "__resource" in (x as object)) {                                             // step 5
      if (ts.isIdentifier(node.expression)) return { __attrRef: { entity: node.expression.text, attribute: key } };
      reject("F-Eval-Member", node, `attribute "${key}" read on an inline resource expression is not foldable`);
    }
    return (x as Record<string, unknown>)[key];                                                       // step 6
  }
  if (ts.isPrefixUnaryExpression(node)) {                                                             // F-Eval-Unary
    const x = F(node.operand);
    if (node.operator === ts.SyntaxKind.ExclamationToken) return !x;
    if (node.operator === ts.SyntaxKind.MinusToken) return -(x as number);
    reject("F-Eval-Unary", node, "unsupported unary");
  }
  if (ts.isBinaryExpression(node)) {                                                                  // F-Eval-Binary
    const K = ts.SyntaxKind, op = node.operatorToken.kind;
    if (op === K.AmpersandAmpersandToken) { const l = F(node.left); return l ? F(node.right) : l; }
    if (op === K.BarBarToken) { const l = F(node.left); return l ? l : F(node.right); }
    if (op === K.QuestionQuestionToken) { const l = F(node.left); return l === null || l === undefined ? F(node.right) : l; }
    const l = F(node.left) as never, r = F(node.right) as never;
    switch (op) {
      case K.PlusToken: return (l as number) + (r as number); case K.MinusToken: return (l as number) - (r as number);
      case K.AsteriskToken: return (l as number) * (r as number); case K.SlashToken: return (l as number) / (r as number);
      case K.EqualsEqualsEqualsToken: return l === r; case K.ExclamationEqualsEqualsToken: return l !== r;
      case K.GreaterThanToken: return l > r; case K.LessThanToken: return l < r;
      case K.GreaterThanEqualsToken: return l >= r; case K.LessThanEqualsToken: return l <= r;
      default: reject("F-Eval-Binary", node, `unsupported binary operator: ${K[op]}`);
    }
  }
  if (ts.isConditionalExpression(node)) return F(node.condition) ? F(node.whenTrue) : F(node.whenFalse); // F-Eval-Conditional
  if (ts.isNewExpression(node)) reject("F-Eval-New", node, "constructions are not implemented in the walking skeleton");
  if (ts.isCallExpression(node)) reject("F-Eval-Reject", node, "function call as a value is not foldable");
  reject("F-Eval-Reject", node, `unsupported expression: ${ts.SyntaxKind[node.kind]}`);
}
