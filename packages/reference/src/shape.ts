/**
 * The shape classifier — grammar.md §2, one S-* rule per branch. Decides
 * from syntax alone; never resolves a name (F-Direction). Returns the first
 * violation in fold-evaluation order, or undefined when the whole shape is
 * admissible.
 */
import * as ts from "typescript";
import type { Host } from "./host";

export interface ShapeViolation { rule: string; node: ts.Node; message: string }

const BINARY = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanEqualsToken, ts.SyntaxKind.LessThanEqualsToken,
]);
const UNARY = new Set<ts.SyntaxKind>([ts.SyntaxKind.ExclamationToken, ts.SyntaxKind.MinusToken]);
const v = (rule: string, node: ts.Node, message: string): ShapeViolation => ({ rule, node, message });
const isLiteralKey = (n: ts.PropertyName) => ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n);

export function findShapeViolation(node: ts.Node, host: Host): ShapeViolation | undefined {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))
    return findShapeViolation(node.expression, host);                                        // S-Unwrap
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isNumericLiteral(node) ||
      node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword)
    return undefined;                                                                         // S-Literal
  if (ts.isIdentifier(node)) return undefined;                                                // S-Ident / S-Undefined
  if (ts.isTaggedTemplateExpression(node)) return undefined;                                  // S-Tagged (interior opaque)
  if (ts.isTemplateExpression(node)) {                                                        // S-Template
    for (const span of node.templateSpans) { const x = findShapeViolation(span.expression, host); if (x) return x; }
    return undefined;
  }
  if (ts.isObjectLiteralExpression(node)) {                                                   // S-Object
    for (const p of node.properties) {
      if (ts.isPropertyAssignment(p)) {
        if (!isLiteralKey(p.name)) return v("S-Prop", p.name, "computed property name");
        const x = findShapeViolation(p.initializer, host); if (x) return x;
      } else if (ts.isShorthandPropertyAssignment(p)) continue;
      else if (ts.isSpreadAssignment(p)) { const x = findShapeViolation(p.expression, host); if (x) return x; }
      else return v("S-Object", p, "unsupported object member");
    }
    return undefined;
  }
  if (ts.isArrayLiteralExpression(node)) {                                                    // S-Array
    for (const el of node.elements) { const x = findShapeViolation(ts.isSpreadElement(el) ? el.expression : el, host); if (x) return x; }
    return undefined;
  }
  if (ts.isPropertyAccessExpression(node)) {                                                  // S-Member / S-CompositeStep
    if (node.name.text === "step" && ts.isCallExpression(node.expression)) return undefined;
    return findShapeViolation(node.expression, host);
  }
  if (ts.isElementAccessExpression(node)) {                                                   // S-Index
    if (!ts.isStringLiteral(node.argumentExpression) && !ts.isNumericLiteral(node.argumentExpression))
      return v("S-Index", node.argumentExpression, "dynamic element-access key");
    return findShapeViolation(node.expression, host);
  }
  if (ts.isPrefixUnaryExpression(node)) {                                                     // S-Unary
    if (!UNARY.has(node.operator)) return v("S-Unary", node, "unsupported unary");
    return findShapeViolation(node.operand, host);
  }
  if (ts.isBinaryExpression(node)) {                                                          // S-Binary (flow-insensitive)
    if (!BINARY.has(node.operatorToken.kind)) return v("S-Binary", node, "unsupported binary operator");
    return findShapeViolation(node.left, host) ?? findShapeViolation(node.right, host);
  }
  if (ts.isConditionalExpression(node))                                                       // S-Conditional
    return findShapeViolation(node.condition, host) ?? findShapeViolation(node.whenTrue, host) ?? findShapeViolation(node.whenFalse, host);
  if (ts.isNewExpression(node)) {                                                             // S-New
    for (const a of node.arguments ?? []) { const x = findShapeViolation(a, host); if (x) return x; }
    return undefined;
  }
  if (ts.isCallExpression(node)) {                                                            // S-Call
    const callee = node.expression;
    const args = () => { for (const a of node.arguments) { const x = findShapeViolation(a, host); if (x) return x; } return undefined; };
    if (ts.isIdentifier(callee)) {
      const name = callee.text;
      if (host.helpers.has(name)) return args();                                              // S-CallHelper
      const def = host.intrinsics.find((i) => i.name === name && !i.isTag);
      if (def?.foldsAsCall || def?.foldsEagerly) return args();                               // S-CallIntrinsic / S-CallEager
    }
    if (ts.isPropertyAccessExpression(callee)) return findShapeViolation(callee.expression, host) ?? args(); // S-CallMethod
    return v("S-Reject", node, "function call as a value is not foldable");
  }
  return v("S-Reject", node, `unsupported expression: ${ts.SyntaxKind[node.kind]}`);
}
