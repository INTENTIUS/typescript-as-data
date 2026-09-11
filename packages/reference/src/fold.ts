/**
 * Expression evaluation: judgments.md J1, one branch per F-Eval-* rule.
 *
 * Written from the specification text, not derived from any implementation
 * (#50). Executes nothing of the source under fold. Its only executions are
 * F-Eval-CallEager and F-Eval-CallMethod on a real receiver, both of which
 * run code the file imported rather than code it wrote.
 */
import * as ts from "typescript";
import {
  intrinsicCallFolds,
  intrinsicCallFoldsEagerly,
  intrinsicTagFolds,
  type IntrinsicDef,
} from "./host";
import { isFoldableHelperName } from "./foldable-helpers";
import { isLiteralKey, isLiteralElementKey, isUnclaimedCallee } from "./subset";

/** A located rejection, per R9.3: the node and the rule, wording unconstrained. */
export class FoldRejection extends Error {
  constructor(
    readonly rule: string,
    readonly line: number,
    readonly column: number,
    message: string,
  ) {
    super(`${line}:${column} - ${message}`);
    this.name = "FoldRejection";
  }
}

/** Γ = (consts, externals, depth), per R6.6. */
export interface Scope {
  readonly consts: Map<string, ts.Expression>;
  readonly externals: ReadonlyMap<string, unknown>;
  readonly depth: number;
}
/** H = (ρ, helpers). The helper allowlist is consulted through foldable-helpers. */
export interface EvalHost {
  readonly intrinsics: readonly IntrinsicDef[];
}

/**
 * F-Val-Callable's marker. J1 may *call* one; it is never a value. Only the
 * module layer populates `externals` with these, so nothing produces one in
 * this implementation yet (#21, #22).
 */
export class FoldableFunction {
  constructor(readonly name: string) {}
}
export const isFoldableFunction = (v: unknown): v is FoldableFunction => v instanceof FoldableFunction;

/**
 * The chain-short-circuit value of F-Eval-Member steps 3 and 4. Not a member
 * of the value domain: it never escapes an optional chain.
 */
const CHAIN = Symbol("chain-short-circuit");
const isChain = (v: unknown): boolean => v === CHAIN;

/** F-Val-Envelope: a non-array object carrying one of the six keys. */
const ENVELOPE_KEYS = ["__attrRef", "__intrinsic", "__helper", "__resource", "__compositeStep", "__symbol"] as const;
export function isEnvelope(v: unknown): boolean {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return ENVELOPE_KEYS.some((k) => k in (v as object));
}

function locate(n: ts.Node): { line: number; column: number } {
  const { line, character } = n.getSourceFile().getLineAndCharacterOfPosition(n.getStart());
  return { line: line + 1, column: character + 1 };
}
function reject(rule: string, n: ts.Node, message: string): never {
  const { line, column } = locate(n);
  throw new FoldRejection(rule, line, column, message);
}

/** True when this access is itself part of an optional chain, so a sentinel propagates. */
function continuesChain(n: ts.Node): boolean {
  const parent: ts.Node | undefined = n.parent;
  if (parent === undefined) return false;
  if (ts.isNonNullExpression(parent) && ts.isOptionalChain(parent)) return continuesChain(parent);
  return (
    (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent) || ts.isCallExpression(parent)) &&
    parent.expression === n &&
    ts.isOptionalChain(parent)
  );
}

/** True when `n` is a const whose initializer is a `new` expression (F-Eval-Ident step 1, F-Eval-Member step 1). */
const boundToNew = (scope: Scope, name: string): boolean => {
  const init = scope.consts.get(name);
  return init !== undefined && ts.isNewExpression(init);
};

/**
 * F-Eval-Interior. Inside an intrinsic's interior an identifier, or a
 * `.`/`[]`/`!` chain rooted at one, that is not `undefined` and resolves in
 * neither consts nor externals folds to `{__symbol}` instead of rejecting.
 */
function isUnresolvedChain(n: ts.Expression, scope: Scope): boolean {
  if (ts.isIdentifier(n)) return n.text !== "undefined" && !scope.consts.has(n.text) && !scope.externals.has(n.text);
  if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isNonNullExpression(n)) {
    return isUnresolvedChain(n.expression, scope);
  }
  return false;
}
function foldInterior(n: ts.Expression, scope: Scope, host: EvalHost): unknown {
  if (isUnresolvedChain(n, scope)) return { __symbol: n.getText() };
  return foldExpr(n, scope, host);
}

/** F-Eval-New's arity rules, per F-Val-Arity. */
function foldNew(node: ts.NewExpression, scope: Scope, host: EvalHost): unknown {
  if (!ts.isIdentifier(node.expression)) {
    reject("F-Eval-New", node, "a constructor reached through anything but a plain identifier is not foldable");
  }
  if (scope.depth > 0) reject("F-Eval-New", node, "`new` inside a folded function body is not foldable");
  const name = node.expression.text;
  const args = node.arguments ?? ([] as unknown as ts.NodeArray<ts.Expression>);
  if (args.length === 0) return { __resource: name, props: {} };
  const folded = args.map((a) => foldExpr(a, scope, host));
  const first = args[0];
  if (ts.isObjectLiteralExpression(first)) {
    if (args.length === 1) return { __resource: name, props: folded[0] };
    if (args.length === 2 && ts.isObjectLiteralExpression(args[1])) {
      return { __resource: name, props: folded[0], attributes: folded[1] };
    }
  }
  const propsIndex = args.findIndex((a) => ts.isObjectLiteralExpression(a));
  return { __resource: name, props: propsIndex === -1 ? {} : folded[propsIndex], args: folded };
}

/** F-Eval-Member and F-Eval-Index share every step but how the key is obtained. */
function foldAccess(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  key: string,
  optional: boolean,
  scope: Scope,
  host: EvalHost,
): unknown {
  // 1. an attribute of a same-file construction is a reference by NAME
  if (ts.isIdentifier(node.expression) && boundToNew(scope, node.expression.text)) {
    return { __attrRef: { entity: node.expression.text, attribute: key } };
  }
  // 2. S-CompositeStep, handled by the caller for property access only
  // 3. sentinel propagation
  const object = foldExpr(node.expression, scope, host);
  if (isChain(object)) return continuesChain(node) ? CHAIN : undefined;
  // 4. nullish
  if (object === null || object === undefined) {
    if (optional) return continuesChain(node) ? CHAIN : undefined;
    reject(
      "F-Eval-Member",
      node,
      `property "${key}" read on ${String(object)} is not foldable: running this expression throws. Write \`?.\` if the value is genuinely optional`,
    );
  }
  // 5. an attribute read on a construction used as a value
  if (isEnvelope(object) && "__resource" in (object as object)) {
    if (ts.isIdentifier(node.expression)) return { __attrRef: { entity: node.expression.text, attribute: key } };
    reject("F-Eval-Member", node, `attribute "${key}" read on an inline construction has no name to reference it by`);
  }
  // 6. a plain index
  return (object as Record<string, unknown>)[key];
}

/** Γ, H ⊢ e ⇓ v. */
export function foldExpr(node: ts.Expression, scope: Scope, host: EvalHost): unknown {
  const F = (n: ts.Expression) => foldExpr(n, scope, host);

  // F-Eval-Unwrap
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    const inner = F(node.expression);
    if (isChain(inner)) return continuesChain(node) ? CHAIN : undefined;
    return inner;
  }

  // F-Eval-Function
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    reject("F-Eval-Function", node, "a function used as a value is not foldable");
  }

  // F-Eval-Literal
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;

  // F-Eval-Ident, in the order the rule gives
  if (ts.isIdentifier(node)) {
    const name = node.text;
    if (name === "undefined") return undefined; // F-Eval-Undefined
    if (scope.consts.has(name)) {
      if (boundToNew(scope, name)) {
        if (scope.externals.has(name)) return scope.externals.get(name);
        reject(
          "F-Eval-Ident",
          node,
          `same-file construction \`${name}\` used as a value is not foldable: folding it again would build a second one`,
        );
      }
      return F(scope.consts.get(name)!);
    }
    if (scope.externals.has(name)) {
      const value = scope.externals.get(name);
      if (isFoldableFunction(value)) reject("F-Eval-Ident", node, `function "${name}" used as a value is not foldable`);
      if (typeof value === "function" && host.intrinsics.some((i) => i.name === name && intrinsicCallFoldsEagerly(i))) {
        reject("F-Eval-Ident", node, `function "${name}" used as a value is not foldable: call it instead`);
      }
      return value;
    }
    if (name === "process") {
      reject(
        "F-Eval-Ident",
        node,
        'ambient "process" read is not foldable: declare a build-time parameter and reference it instead',
      );
    }
    reject("F-Eval-Ident", node, `unresolved identifier: ${name}`);
  }

  // F-Eval-Tagged
  if (ts.isTaggedTemplateExpression(node)) {
    if (scope.depth > 0) reject("F-Eval-Tagged", node, "a tagged template inside a folded function body is not foldable");
    const tag = node.tag.getText();
    if (!host.intrinsics.some((i) => i.name === tag && intrinsicTagFolds(i))) {
      reject("F-Eval-Tagged", node, `unregistered tagged template intrinsic: ${tag}`);
    }
    const t = node.template;
    if (ts.isNoSubstitutionTemplateLiteral(t)) return { __intrinsic: tag, strings: [t.text], values: [] };
    return {
      __intrinsic: tag,
      strings: [t.head.text, ...t.templateSpans.map((s) => s.literal.text)],
      values: t.templateSpans.map((s) => foldInterior(s.expression, scope, host)),
    };
  }

  // F-Eval-Template
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) {
      const value = F(span.expression);
      if (isEnvelope(value)) {
        reject(
          "F-Eval-Template",
          span.expression,
          "a symbolic value interpolated into a plain template literal is not foldable: it has no string form until the build resolves it",
        );
      }
      out += String(value) + span.literal.text;
    }
    return out;
  }

  // F-Eval-Object
  if (ts.isObjectLiteralExpression(node)) {
    const out: Record<string, unknown> = {};
    for (const member of node.properties) {
      if (ts.isPropertyAssignment(member)) {
        if (!isLiteralKey(member.name)) reject("F-Eval-Object", member.name, "computed or dynamic property name");
        out[member.name.text] = F(member.initializer);
      } else if (ts.isShorthandPropertyAssignment(member)) {
        out[member.name.text] = F(member.name);
      } else if (ts.isSpreadAssignment(member)) {
        const source = F(member.expression);
        if (source === null || typeof source !== "object") {
          reject("F-Eval-Object", member, "spread source is not an object");
        }
        Object.assign(out, source);
      } else {
        reject("F-Eval-Object", member, "unsupported object member");
      }
    }
    return out;
  }

  // F-Eval-Array
  if (ts.isArrayLiteralExpression(node)) {
    const out: unknown[] = [];
    for (const el of node.elements) {
      if (ts.isSpreadElement(el)) {
        const source = F(el.expression);
        if (!Array.isArray(source)) reject("F-Eval-Array", el, "spread source is not an array");
        out.push(...source);
      } else {
        out.push(F(el));
      }
    }
    return out;
  }

  // F-Eval-Member, with step 2 checked before the object is folded
  if (ts.isPropertyAccessExpression(node)) {
    if (node.name.text === "step" && ts.isCallExpression(node.expression) && isUnclaimedCallee(node.expression, host.intrinsics)) {
      if (scope.depth > 0) reject("F-Eval-Member", node, "a composite step inside a folded function body is not foldable");
      const call = node.expression;
      return {
        __compositeStep: (call.expression as ts.Identifier).text,
        args: call.arguments.map((a) => F(a)),
      };
    }
    return foldAccess(node, node.name.text, node.questionDotToken !== undefined, scope, host);
  }

  // F-Eval-Index
  if (ts.isElementAccessExpression(node)) {
    const key = node.argumentExpression;
    if (!isLiteralElementKey(key)) {
      reject("F-Eval-Index", key, "element-access key must be a string or numeric literal");
    }
    return foldAccess(node, key.text, node.questionDotToken !== undefined, scope, host);
  }

  // F-Eval-Unary
  if (ts.isPrefixUnaryExpression(node)) {
    if (node.operator === ts.SyntaxKind.ExclamationToken) return !F(node.operand);
    if (node.operator === ts.SyntaxKind.MinusToken) return -Number(F(node.operand));
    reject("F-Eval-Unary", node, `unsupported unary operator: ${ts.SyntaxKind[node.operator]}`);
  }

  // F-Eval-Binary
  if (ts.isBinaryExpression(node)) {
    const K = ts.SyntaxKind;
    const op = node.operatorToken.kind;
    if (op === K.AmpersandAmpersandToken) {
      const left = F(node.left);
      return left ? F(node.right) : left;
    }
    if (op === K.BarBarToken) {
      const left = F(node.left);
      return left ? left : F(node.right);
    }
    if (op === K.QuestionQuestionToken) {
      const left = F(node.left);
      return left === null || left === undefined ? F(node.right) : left;
    }
    const l = F(node.left) as never;
    const r = F(node.right) as never;
    switch (op) {
      case K.PlusToken: return (l as unknown as number) + (r as unknown as number);
      case K.MinusToken: return (l as unknown as number) - (r as unknown as number);
      case K.AsteriskToken: return (l as unknown as number) * (r as unknown as number);
      case K.SlashToken: return (l as unknown as number) / (r as unknown as number);
      case K.EqualsEqualsEqualsToken: return l === r;
      case K.ExclamationEqualsEqualsToken: return l !== r;
      case K.GreaterThanToken: return l > r;
      case K.LessThanToken: return l < r;
      case K.GreaterThanEqualsToken: return l >= r;
      case K.LessThanEqualsToken: return l <= r;
      default: reject("F-Eval-Binary", node, `unsupported binary operator: ${K[op]}`);
    }
  }

  // F-Eval-Conditional
  if (ts.isConditionalExpression(node)) return F(node.condition) ? F(node.whenTrue) : F(node.whenFalse);

  // F-Eval-New
  if (ts.isNewExpression(node)) return foldNew(node, scope, host);

  // F-Eval-Call*: helper, intrinsic, local, eager, method, in that order
  if (ts.isCallExpression(node)) {
    const callee = node.expression;

    if (ts.isIdentifier(callee) && !scope.consts.has(callee.text)) {
      const name = callee.text;

      // F-Eval-CallHelper
      if (isFoldableHelperName(name)) {
        if (scope.depth > 0) reject("F-Eval-CallHelper", node, "an authoring helper call inside a folded function body is not foldable");
        return { __helper: name, args: node.arguments.map((a) => F(a)) };
      }

      // F-Eval-CallIntrinsic
      if (host.intrinsics.some((i) => i.name === name && intrinsicCallFolds(i))) {
        if (scope.depth > 0) reject("F-Eval-CallIntrinsic", node, "an intrinsic call inside a folded function body is not foldable");
        return { __intrinsic: name, args: node.arguments.map((a) => foldInterior(a, scope, host)) };
      }

      // F-Eval-CallLocal, after the two registered shapes
      const local = scope.externals.get(name);
      if (isFoldableFunction(local)) {
        reject(
          "F-Eval-CallLocal",
          node,
          `call to "${name}" is not foldable: this implementation has no module layer to fold a project-local function body`,
        );
      }

      // F-Eval-CallEager
      if (host.intrinsics.some((i) => i.name === name && intrinsicCallFoldsEagerly(i))) {
        if (typeof local !== "function") reject("F-Eval-CallEager", node, `"${name}" did not resolve to a function`);
        return (local as (...a: unknown[]) => unknown)(...node.arguments.map((a) => F(a)));
      }
    }

    // F-Eval-CallMethod
    if (ts.isPropertyAccessExpression(callee)) {
      const method = callee.name.text;
      const receiver = F(callee.expression);
      if (isChain(receiver)) return continuesChain(node) ? CHAIN : undefined;
      if (receiver === null || receiver === undefined) {
        if (callee.questionDotToken) return continuesChain(node) ? CHAIN : undefined;
        reject("F-Eval-CallMethod", node, `cannot call ".${method}(...)" on ${String(receiver)}`);
      }
      if (isEnvelope(receiver)) {
        reject("F-Eval-CallMethod", node, `a method call on a symbolic value is not foldable`);
      }
      const fn = (receiver as Record<string, unknown>)[method];
      if (typeof fn !== "function") reject("F-Eval-CallMethod", node, `"${method}" is not a callable method on the folded value`);
      return (fn as (...a: unknown[]) => unknown).apply(receiver, node.arguments.map((a) => F(a)));
    }

    reject("F-Eval-Reject", node, "function call as a value is not foldable");
  }

  // F-Eval-Reject
  reject("F-Eval-Reject", node, `unsupported expression: ${ts.SyntaxKind[node.kind]}`);
}

/** F-Bind: a top-level `const` with an identifier name and an initializer. */
export function collectConsts(sf: ts.SourceFile): Map<string, ts.Expression> {
  const out = new Map<string, ts.Expression>();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    if ((st.declarationList.flags & ts.NodeFlags.Const) === 0) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer) out.set(d.name.text, d.initializer);
    }
  }
  return out;
}
