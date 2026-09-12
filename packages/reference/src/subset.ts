/**
 * The shape classifier: grammar.md §2, one branch per S-* production.
 *
 * Written from the specification text, not derived from any implementation
 * (#50). Decides from syntax alone and never resolves a name, which is the
 * direction F-Direction permits: this may accept what the folder rejects and
 * must never reject what the folder accepts, outside F-Exc-Lazy and
 * F-Exc-Registry.
 */
import * as ts from "typescript";
import { intrinsicCallFolds, intrinsicCallFoldsEagerly, type IntrinsicDef } from "./host.js";
import { isFoldableHelperName } from "./foldable-helpers.js";

export interface ShapeViolation {
  /** The S-* production that refused it. */
  readonly rule: string;
  readonly node: ts.Node;
  readonly message: string;
}
const no = (rule: string, node: ts.Node, message: string): ShapeViolation => ({ rule, node, message });

/** ⟨BinOp⟩, grammar.md §2. */
const BIN_OPS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.LessThanEqualsToken,
]);
/** S-Unary's operator set. */
const UNARY_OPS: ReadonlySet<ts.SyntaxKind> = new Set([ts.SyntaxKind.ExclamationToken, ts.SyntaxKind.MinusToken]);

/** ⟨LiteralKey⟩ ::= ⟨Identifier⟩ | ⟨StringLiteral⟩ | ⟨NumericLiteral⟩ */
export function isLiteralKey(n: ts.PropertyName): n is ts.Identifier | ts.StringLiteral | ts.NumericLiteral {
  return ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n);
}
/** S-Index's key: a string or numeric literal only. */
export function isLiteralElementKey(n: ts.Expression): n is ts.StringLiteral | ts.NumericLiteral {
  return ts.isStringLiteral(n) || ts.isNumericLiteral(n);
}

/**
 * S-CompositeStep's callee condition.
 *
 * SPEC GAP (#51): the normative text calls this callee "unclaimed" in four
 * places and defines it in none; all four cite inventory row L3.20, which is
 * a ledger entry. Implemented here per that row's intent, which is that the
 * callee is a bare identifier claimed by no other S-Call form and not
 * shadowed by a local const. The registry and the local scope are resolution,
 * so at shape level only the bare-identifier part is checkable.
 */
export function isUnclaimedCallee(call: ts.CallExpression, intrinsics?: readonly IntrinsicDef[]): boolean {
  if (!ts.isIdentifier(call.expression)) return false;
  const name = call.expression.text;
  if (isFoldableHelperName(name)) return false;
  if (intrinsics?.some((i) => i.name === name && (intrinsicCallFolds(i) || intrinsicCallFoldsEagerly(i)))) return false;
  return true;
}

/**
 * Classify `node`'s shape. Returns the first violation in evaluation order,
 * or undefined when the whole shape is admissible.
 *
 * `intrinsics` is the registry ρ. Absent, S-CallIntrinsic and S-CallEager are
 * unrecognisable and their shapes fall to S-Reject, which is F-Exc-Registry:
 * the one place this classifier is stricter than the folder.
 */
export function findShapeViolation(node: ts.Node, intrinsics?: readonly IntrinsicDef[], localCallees?: ReadonlySet<string>): ShapeViolation | undefined {
  const recur = (n: ts.Node) => findShapeViolation(n, intrinsics, localCallees);

  // S-Unwrap
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return recur(node.expression);
  }

  // S-Literal
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return undefined;
  }

  // S-Ident, which S-Undefined is an instance of. Always shape-valid:
  // whether it resolves is F-Eval-Ident's question (F-Div-Ident).
  if (ts.isIdentifier(node)) return undefined;

  // S-Tagged. The interior is opaque and is deliberately not recursed into:
  // an intrinsic's interpolations legitimately hold shapes this classifier
  // would refuse, and only the folder has the registry (F-Div-Tag).
  if (ts.isTaggedTemplateExpression(node)) return undefined;

  // S-Template
  if (ts.isTemplateExpression(node)) {
    for (const span of node.templateSpans) {
      const v = recur(span.expression);
      if (v) return v;
    }
    return undefined;
  }

  // S-Object
  if (ts.isObjectLiteralExpression(node)) {
    for (const member of node.properties) {
      if (ts.isPropertyAssignment(member)) {
        if (!isLiteralKey(member.name)) return no("S-Prop", member.name, "computed or dynamic property name");
        const v = recur(member.initializer);
        if (v) return v;
      } else if (ts.isShorthandPropertyAssignment(member)) {
        continue; // S-Shorthand: always shape-valid
      } else if (ts.isSpreadAssignment(member)) {
        const v = recur(member.expression);
        if (v) return v;
      } else {
        return no("S-Object", member, "unsupported object member");
      }
    }
    return undefined;
  }

  // S-Array
  if (ts.isArrayLiteralExpression(node)) {
    for (const el of node.elements) {
      const v = recur(ts.isSpreadElement(el) ? el.expression : el);
      if (v) return v;
    }
    return undefined;
  }

  // S-Member, with S-CompositeStep taking precedence when the member is
  // `step` and the object is a call.
  if (ts.isPropertyAccessExpression(node)) {
    if (node.name.text === "step" && ts.isCallExpression(node.expression)) return undefined;
    return recur(node.expression);
  }

  // S-Index
  if (ts.isElementAccessExpression(node)) {
    if (!isLiteralElementKey(node.argumentExpression)) {
      return no("S-Index", node.argumentExpression, "element-access key must be a string or numeric literal");
    }
    return recur(node.expression);
  }

  // S-Unary
  if (ts.isPrefixUnaryExpression(node)) {
    if (!UNARY_OPS.has(node.operator)) return no("S-Unary", node, `unsupported unary operator: ${ts.SyntaxKind[node.operator]}`);
    return recur(node.operand);
  }

  // S-Binary. Flow-insensitive by construction: both sides must be
  // shape-valid even where the folder would evaluate only one (F-Exc-Lazy).
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (!BIN_OPS.has(op)) return no("S-Binary", node, `unsupported binary operator: ${ts.SyntaxKind[op]}`);
    return recur(node.left) ?? recur(node.right);
  }

  // S-Conditional. Flow-insensitive for the same reason.
  if (ts.isConditionalExpression(node)) {
    return recur(node.condition) ?? recur(node.whenTrue) ?? recur(node.whenFalse);
  }

  // S-New. The callee's shape is unconstrained here; that it must be a plain
  // identifier is resolution-adjacent and belongs to F-Eval-New (F-Div-NsNew).
  if (ts.isNewExpression(node)) {
    for (const arg of node.arguments ?? []) {
      const v = recur(arg);
      if (v) return v;
    }
    return undefined;
  }

  // S-Call
  if (ts.isCallExpression(node)) {
    const args = (): ShapeViolation | undefined => {
      for (const a of node.arguments) {
        const v = recur(a);
        if (v) return v;
      }
      return undefined;
    };

    // S-CallMethod: receiver ∈ ⟨Expr⟩, method name unconstrained.
    if (ts.isPropertyAccessExpression(node.expression)) return recur(node.expression.expression) ?? args();

    if (ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (isFoldableHelperName(name)) return args(); // S-CallHelper
      // S-CallLocal (spec 1.2): the callee is bound in this file by
      // S-LocalFunction or by an import from a project specifier. The body's
      // admissibility is the fold's question (S-FnBody at the call).
      if (localCallees?.has(name)) return args();
      const def = intrinsics?.find((i) => i.name === name);
      // S-CallIntrinsic / S-CallEager, registry-gated. Without ρ neither is
      // recognisable and the call falls to S-Reject (F-Exc-Registry).
      if (def && (intrinsicCallFolds(def) || intrinsicCallFoldsEagerly(def))) return args();
    }

    return no("S-Reject", node, "function call as a value is not foldable");
  }

  // S-Reject. This is where the explicitly-outside list lands: a function or
  // arrow expression used as a value, class expressions, await, yield,
  // assignment, the comma operator, and every operator outside ⟨BinOp⟩.
  return no("S-Reject", node, `unsupported expression: ${ts.SyntaxKind[node.kind]}`);
}
