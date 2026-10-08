/**
 * Expression evaluation: evaluation.md (J1), one branch per F-Eval-* rule.
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
} from "./host.js";
import { isFoldableHelperName } from "./foldable-helpers.js";
import { isLiteralKey, isLiteralElementKey, isUnclaimedCallee } from "./subset.js";
import { findFnBodyViolation, plainBindingKey, type FnDecl } from "./fnbody.js";
import { record } from "./trace.js";
import { collapse, derive, leaf, project, writerOrigin, type OTree, type ParamRef, type Writer } from "./provenance.js";

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
  /**
   * F-Capture's sink for the file being folded, when there is one. A call that
   * leaks the defining module's identity (F-CallLeak) records that module here,
   * which is the same edge an import capture records.
   */
  readonly captures?: Set<string>;
  /** Inside an interpreted factory body (S-FactoryBody): `new` and a call through a bare identifier are admitted at depth > 0. */
  readonly factory?: boolean;
  /** F-Obs-Provenance: who writes a literal here, and the origins of names this scope binds (parameters, body consts). */
  readonly prov?: ProvScope;
  /**
   * F-Obs-Provenance: the export name a binding to a project function or
   * composite resolved, where it differs from the declared name. An import
   * maps its local name to the name it imports; a module's own function
   * maps to the name it is exported under.
   */
  readonly exportNames?: ReadonlyMap<string, string>;
}
export interface ProvScope { readonly writer: Writer; readonly names: Map<string, OTree> }

/**
 * F-Obs-Provenance's side channel for one file's fold. Each `foldExpr` call
 * gets a frame that collects its direct sub-evaluations, so the origin of a
 * node is computed from its children's, after the value is. The evaluator's
 * own logic is untouched.
 */
export class ProvState {
  readonly frames: Map<ts.Node, { v: unknown; o: OTree }>[] = [new Map()];
  /** A call node to the origin of what its interpreted body returned. */
  readonly results = new Map<ts.Node, OTree>();
  get(n: ts.Node): OTree | undefined { return this.frames[this.frames.length - 1].get(n)?.o; }
  record(n: ts.Node, v: unknown, o: OTree): void { this.frames[this.frames.length - 1].set(n, { v, o }); }
}
/** H = (ρ, helpers). The helper allowlist is consulted through foldable-helpers. */
/**
 * F-Obs-Counters, per build. `projectFactoryInvocations` is zero by
 * construction here: a project composite is interpreted from source (F-Call
 * step 5) and only a host-bound factory is invoked (step 6), so the reference
 * never executes project-owned code while folding.
 */
export interface ExecutionCounters { factoryInvocations: number; projectFactoryInvocations: number; factoryInterpretations: number }

export interface EvalHost {
  readonly intrinsics: readonly IntrinsicDef[];
  /**
   * F-Val-Fate at a call inside a factory body: what J2 would revive a folded
   * argument to before a host factory is invoked with it. Absent in an
   * expression-level fold, where nothing is invoked.
   */
  readonly live?: (value: unknown, node: ts.Node, what: string) => unknown;
  /** F-Val-Fate through a given module's bindings: an interpreted factory's members revive through the defining module's imports. */
  readonly reviveIn?: (bindings: ReadonlyMap<string, unknown>, value: unknown, node: ts.Node, what: string) => unknown;
  /** Names bound by an import from a host package (F-Host-Trust arm 1), which F-Call may invoke. */
  readonly hostBound?: ReadonlySet<string>;
  /** F-Obs-Counters, when the module layer keeps them. */
  readonly counters?: ExecutionCounters;
  /** F-Call by node, from the module layer, for a nested composite in a factory body; resolved once per call site (F-Count). */
  readonly fcall?: (call: ts.CallExpression) => unknown;
  /**
   * F-Declarator (spec 1.6): the call a declarator's initializer is, whose
   * direct arguments resolve a package call through F-Call before J1 sees
   * them; `resolveArg` answers `undefined` for an argument that is not one.
   */
  readonly declaratorCall?: ts.CallExpression;
  readonly resolveArg?: (a: ts.Expression) => { value: unknown; origin?: OTree } | undefined;
  /** F-Obs-Provenance, when the module layer records it. */
  readonly prov?: ProvState;
}

/**
 * A composite definition a host published (F-Host-Interface item 6 names the
 * registration form; what it returns carries `compositeName`, as chant's
 * `CompositeDefinition` does), or one F-Host-Composite registered here.
 */
export function isCompositeDefinition(v: unknown): boolean {
  return isCompositeFactory(v) || (typeof v === "function" && "compositeName" in v);
}

/**
 * A project composite the host's registration form made interpretable
 * (F-Host-Composite): `export const N = Composite(fn, "N")` with `Composite`
 * bound in that module to an import of the host's own. A call folds the body
 * against the defining module's scope (F-Call step 4) and never imports.
 */
const NO_NAMES: ReadonlyMap<string, string> = new Map();
export class CompositeFactory {
  constructor(
    readonly name: string,
    readonly fn: FnDecl,
    readonly file: string,
    readonly consts: Map<string, ts.Expression>,
    readonly externals: ReadonlyMap<string, unknown>,
    /** The defining module's `Scope.exportNames`, for calls the body makes. */
    readonly exportNames: ReadonlyMap<string, string> = NO_NAMES,
  ) {}
}
export const isCompositeFactory = (v: unknown): v is CompositeFactory => v instanceof CompositeFactory;
/** F-Depth: nested factory interpretation. */
export const MAX_INTERPRETATION_DEPTH = 16;

/**
 * F-Val-Callable's marker. J1 may *call* one; it is never a value. Only the
 * module layer populates `externals` with these, so nothing produces one in
 * this implementation yet (#21, #22).
 */
export class FoldableFunction {
  /** Set when a call returned a live object the body produced (F-CallLeak, J3). */
  leakedIdentity = false;
  constructor(
    readonly name: string,
    readonly fn: FnDecl,
    /** The defining module's path, for the re-anchored reason of F-Eval-CallLocal step 7. */
    readonly file: string,
    /** The DEFINING module's scope: a body folds there, not in the caller's (R6.6). */
    readonly consts: Map<string, ts.Expression>,
    readonly externals: ReadonlyMap<string, unknown>,
    /** The defining module's `Scope.exportNames`, for calls the body makes. */
    readonly exportNames: ReadonlyMap<string, string> = NO_NAMES,
  ) {}
}
export const isFoldableFunction = (v: unknown): v is FoldableFunction => v instanceof FoldableFunction;

/**
 * The chain-short-circuit value of F-Eval-Member steps 3 and 4. Not a member
 * of the value domain: it never escapes an optional chain.
 */
const CHAIN = Symbol("chain-short-circuit");
const isChain = (v: unknown): boolean => v === CHAIN;

/**
 * F-Val-Live: carries a live object when it, or anything reachable through
 * plain objects and arrays, has a prototype other than the plain ones, or is
 * a function. This is F-Identity's entity test, the normative one, and the
 * test F-CallLeak uses. F-Import uses the broader reference test instead, on
 * purpose; F-Identity in J3 says why.
 */
export function carriesLiveObject(v: unknown, seen = new Set<unknown>()): boolean {
  if (v === null || typeof v !== "object") return typeof v === "function";
  if (seen.has(v)) return false;
  seen.add(v);
  if (isLiveObject(v)) return true;
  return Object.values(v).some((inner) => carriesLiveObject(inner, seen));
}

/**
 * The non-recursive half of F-Val-Live: this value *is* a live object, rather
 * than a plain structure that may hold one. Revival passes these through
 * unchanged (L6.1); rebuilding one would destroy the identity J3 preserves.
 */
export function isLiveObject(v: unknown): boolean {
  if (typeof v === "function") return true;
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) return true;
  // L6.1: a Declarable or a CompositeInstance is live whatever its prototype.
  // F-Host-Interface item 1 says an entity carries a non-enumerable declarable
  // marker, and a composite instance keeps its bookkeeping non-enumerable, so
  // a non-enumerable own property or an own symbol is the marker.
  if (Array.isArray(v)) return false;
  if (Object.getOwnPropertySymbols(v).length > 0) return true;
  return Object.getOwnPropertyNames(v).some((k) => !Object.getOwnPropertyDescriptor(v, k)!.enumerable);
}

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
  if (scope.depth > 0 && !scope.factory) reject("F-Eval-New", node, "`new` inside a folded function body is not foldable");
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

/** The depth bound of F-Eval-CallLocal step 2, stated per F-Depth. */
export const MAX_CALL_DEPTH = 32;

/** F-Eval-CallLocal: evaluate a call to a project-local function, seven steps. */
function callLocal(callee: FoldableFunction, node: ts.CallExpression, scope: Scope, host: EvalHost, exportName = callee.name): unknown {
  const label = `call to "${callee.name}" (${callee.file})`;
  // 1. the declaration must satisfy S-FnBody
  const violation = findFnBodyViolation(callee.fn);
  if (violation) reject("F-Eval-CallLocal", node, `${label} is not foldable: ${violation}`);
  // 2. depth bound
  if (scope.depth >= MAX_CALL_DEPTH) reject("F-Eval-CallLocal", node, `${label} is not foldable: call depth exceeded`);
  // 3. arguments fold in the CALLER's scope; a spread argument rejects
  const args: unknown[] = [];
  for (const a of node.arguments) {
    if (ts.isSpreadElement(a)) reject("F-Eval-CallLocal", node, `${label} is not foldable: a spread argument is not foldable`);
    args.push(foldExpr(a, scope, host));
  }
  // 4. the body folds in the DEFINING module's scope, parameters bound on top
  const consts = new Map(callee.consts);
  const externals = new Map(callee.externals);
  const bind = (n: string, v: unknown) => { consts.delete(n); externals.set(n, v); };
  const prov = host.prov ? callProv(exportName, node, callee.fn, scope, host) : undefined;
  const inner: Scope = { consts, externals, depth: scope.depth + 1, prov: prov?.scope, exportNames: callee.exportNames };
  const bindO = (n: string, o: OTree | undefined) => { prov?.scope.names.set(n, o ?? leaf(writerOrigin(prov.scope.writer, node))); };
  callee.fn.parameters.forEach((param, i) => {
    let value = args[i];
    const defaulted = value === undefined && !!param.initializer;
    if (value === undefined && param.initializer) value = foldExpr(param.initializer, inner, host);
    const ref = prov?.param(i, defaulted);
    if (ts.isIdentifier(param.name)) { bind(param.name.text, value); if (ref) bindO(param.name.text, ref); return; }
    if (value === null || typeof value !== "object") {
      reject("F-Eval-CallLocal", node, `${label} is not foldable: a destructured parameter's argument is not an object`);
    }
    for (const el of (param.name as ts.ObjectBindingPattern).elements) {
      bind((el.name as ts.Identifier).text, (value as Record<string, unknown>)[plainBindingKey(el)!]);
      if (ref) bindO((el.name as ts.Identifier).text, project(ref, plainBindingKey(el)!));
    }
  });
  // 5. a concise body is its expression; a block folds its consts then returns
  let result: unknown;
  try {
    const body = callee.fn.body as ts.ConciseBody;
    if (!ts.isBlock(body)) {
      result = foldExpr(body, inner, host);
      prov?.done(body);
    } else {
      result = undefined;
      for (const st of body.statements) {
        if (ts.isReturnStatement(st)) { result = st.expression ? foldExpr(st.expression, inner, host) : undefined; prov?.done(st.expression); break; }
        for (const d of (st as ts.VariableStatement).declarationList.declarations) {
          const v = foldExpr(d.initializer!, inner, host);
          const o = host.prov?.get(d.initializer!);
          if (ts.isIdentifier(d.name)) { bind(d.name.text, v); bindO(d.name.text, o); }
          else {
            if (v === null || typeof v !== "object") reject("F-Eval-CallLocal", node, `${label} is not foldable: a destructured const's source is not an object`);
            for (const el of (d.name as ts.ObjectBindingPattern).elements) {
              bind((el.name as ts.Identifier).text, (v as Record<string, unknown>)[plainBindingKey(el)!]);
              bindO((el.name as ts.Identifier).text, o && project(o, plainBindingKey(el)!));
            }
          }
        }
      }
    }
  } catch (e) {
    // 7. re-anchor a failure inside the body at the call site
    if (e instanceof FoldRejection) {
      reject(e.rule, node, `${label} is not foldable: ${callee.file}:${e.line}:${e.column} - ${e.message.replace(/^\d+:\d+ - /, "")}`);
    }
    throw e;
  }
  // 6. a live object the body produced, that no argument carried, leaks identity
  if (carriesLiveObject(result) && !args.some((a) => carriesLiveObject(a))) {
    callee.leakedIdentity = true;
    scope.captures?.add(callee.file);
  }
  return result;
}

/**
 * F-Call step 4: interpretation of a registered project composite under
 * S-FactoryParams and S-FactoryBody (R7.2 rules 3 to 5). The body folds
 * against the defining module's scope with the one parameter bound; `new`
 * and bare-identifier calls are admitted inside, and the result is the
 * members record, which J2 revives.
 */
export function interpret(factory: CompositeFactory, args: unknown[], node: ts.Node, depth: number, host: EvalHost, argNodes?: readonly ts.Node[], argConsts?: ReadonlyMap<string, ts.Expression>, exportName = factory.name): unknown {
  const label = `composite "${factory.name}" (${factory.file})`;
  const why = findFactoryViolation(factory.fn);
  if (why) reject("F-Call", node, `${label} is not interpretable: ${why}`);
  if (depth >= MAX_INTERPRETATION_DEPTH) reject("F-Depth", node, `${label} is not interpretable: interpretation depth exceeded`);
  if (host.counters) host.counters.factoryInterpretations += 1;
  const consts = new Map(factory.consts);
  const externals = new Map(factory.externals);
  const bind = (n: string, v: unknown) => { consts.delete(n); externals.set(n, v); };
  const prov = host.prov ? callProv(exportName, node, factory.fn, { consts: argConsts ?? new Map() }, host, argNodes) : undefined;
  const inner: Scope = { consts, externals, depth: depth + 1, factory: true, prov: prov?.scope, exportNames: factory.exportNames };
  const bindO = (n: string, o: OTree | undefined) => { prov?.scope.names.set(n, o ?? leaf(writerOrigin(prov.scope.writer, node))); };
  const param = factory.fn.parameters[0];
  if (param) {
    const value = args[0];
    const ref = prov?.param(0, false);
    if (ts.isIdentifier(param.name)) { bind(param.name.text, value); bindO(param.name.text, ref); }
    else {
      if (value === null || typeof value !== "object") reject("F-Call", node, `${label} is not interpretable: its argument is not an object`);
      for (const el of (param.name as ts.ObjectBindingPattern).elements) {
        bind((el.name as ts.Identifier).text, (value as Record<string, unknown>)[plainBindingKey(el)!]);
        if (ref) bindO((el.name as ts.Identifier).text, project(ref, plainBindingKey(el)!));
      }
    }
  }
  // The members revive through the DEFINING module's imports, since the body folded in its scope.
  const done = (members: unknown) => (host.reviveIn ? host.reviveIn(factory.externals, members, node, label) : members);
  try {
    const body = factory.fn.body as ts.ConciseBody;
    if (!ts.isBlock(body)) { const v = foldExpr(body, inner, host); prov?.done(body); return done(v); }
    for (const st of body.statements) {
      if (ts.isReturnStatement(st)) { const v = foldExpr(st.expression!, inner, host); prov?.done(st.expression); return done(v); }
      for (const d of (st as ts.VariableStatement).declarationList.declarations) {
        const v = foldExpr(d.initializer!, inner, host);
        const o = host.prov?.get(d.initializer!);
        if (ts.isIdentifier(d.name)) { bind(d.name.text, v); bindO(d.name.text, o); }
        else {
          if (v === null || typeof v !== "object") reject("F-Call", node, `${label} is not interpretable: a destructured const's source is not an object`);
          for (const el of (d.name as ts.ObjectBindingPattern).elements) {
            bind((el.name as ts.Identifier).text, (v as Record<string, unknown>)[plainBindingKey(el)!]);
            bindO((el.name as ts.Identifier).text, o && project(o, plainBindingKey(el)!));
          }
        }
      }
    }
    return undefined;
  } catch (e) {
    if (e instanceof FoldRejection) {
      reject(e.rule, node, `${label} is not interpretable: ${factory.file}:${e.line}:${e.column} - ${e.message.replace(/^\d+:\d+ - /, "")}`);
    }
    throw e;
  }
}

/** S-FactoryParams and S-FactoryBody: at most one plainly bound parameter; consts then a final `return`, which must be present. */
export function findFactoryViolation(fn: FnDecl): string | undefined {
  if (fn.parameters.length > 1) return "a factory takes at most one parameter";
  const p = fn.parameters[0];
  if (p) {
    if (p.dotDotDotToken) return "a rest parameter is not interpretable";
    if (p.initializer) return "a parameter default is not interpretable";
    if (!ts.isIdentifier(p.name)) {
      if (!ts.isObjectBindingPattern(p.name)) return "an array-pattern parameter is not interpretable";
      for (const el of p.name.elements) if (el.dotDotDotToken || el.initializer || !ts.isIdentifier(el.name) || !plainBindingKey(el)) return "a parameter pattern with a rest, default, nested or computed element is not interpretable";
    }
  }
  const body = fn.body as ts.ConciseBody | undefined;
  if (!body) return "a factory without a body is not interpretable";
  if (!ts.isBlock(body)) return undefined;
  if (body.statements.length === 0) return "an empty factory body is not interpretable";
  const last = body.statements[body.statements.length - 1];
  if (!ts.isReturnStatement(last) || !last.expression) return "a factory body must end in a return";
  for (const st of body.statements.slice(0, -1)) {
    if (!ts.isVariableStatement(st) || !(st.declarationList.flags & ts.NodeFlags.Const)) return "a factory body is consts then a final return";
    for (const d of st.declarationList.declarations) {
      if (!d.initializer) return "an uninitialized const is not interpretable";
      if (!ts.isIdentifier(d.name) && !(ts.isObjectBindingPattern(d.name) && d.name.elements.every((el) => !el.dotDotDotToken && !el.initializer && ts.isIdentifier(el.name) && plainBindingKey(el)))) return "a destructuring const with a rest, default, nested or computed element is not interpretable";
    }
  }
  return undefined;
}

/** Γ, H ⊢ e ⇓ v. With provenance on, the value's origin is recorded beside it (F-Obs-Provenance). */
export function foldExpr(node: ts.Expression, scope: Scope, host: EvalHost): unknown {
  const p = host.prov;
  if (!p) return foldRaw(node, scope, host);
  const frame = new Map<ts.Node, { v: unknown; o: OTree }>();
  p.frames.push(frame);
  p.results.delete(node);
  let v: unknown;
  try { v = foldRaw(node, scope, host); } finally { p.frames.pop(); }
  p.record(node, v, originOf(node, v, scope, frame, p));
  return v;
}

function foldRaw(node: ts.Expression, scope: Scope, host: EvalHost): unknown {
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
      // F-Eval-Ident step 3, F-Val-Callable (#69): a callable of any kind is
      // reached by the form that invokes it, never as a value.
      if (isFoldableFunction(value) || isCompositeFactory(value)) reject("F-Eval-Ident", node, `function "${name}" used as a value is not foldable`);
      if (typeof value === "function") {
        const eager = host.intrinsics.some((i) => i.name === name && intrinsicCallFoldsEagerly(i));
        reject("F-Eval-Ident", node, `function "${name}" used as a value is not foldable${eager ? ": call it instead" : ""}`);
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
    // F-Eval-Ident step 5 hands this case to F-Reference by name: "Otherwise
    // reject `unresolved identifier: n` (F-Reference)". `project.ts` already
    // reports the neighbouring case that way, so naming F-Eval-Ident here
    // disagreed with the specification and with this package (#217).
    reject("F-Reference", node, `unresolved identifier: ${name}`);
  }

  // F-Eval-Tagged
  if (ts.isTaggedTemplateExpression(node)) {
    if (scope.depth > 0 && !scope.factory) reject("F-Eval-Tagged", node, "a tagged template inside a folded function body is not foldable");
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

  // F-Eval-Call*: local, helper, intrinsic, eager, method, in that order
  if (ts.isCallExpression(node)) {
    const callee = node.expression;

    if (ts.isIdentifier(callee) && !scope.consts.has(callee.text)) {
      const name = callee.text;

      // At a declarator, a direct argument that is itself a package call is F-Call's (F-Declarator, spec 1.6).
      const arg = (a: ts.Expression, fallback: (a: ts.Expression) => unknown): unknown => {
        if (node === host.declaratorCall && host.resolveArg) {
          const r = host.resolveArg(a);
          if (r) { host.prov?.record(a, r.value, r.origin ?? leaf({ kind: "unknown", reason: "host-call" })); return r.value; }
        }
        return fallback(a);
      };

      // F-Eval-CallLocal, before the two registered shapes (spec 1.7, #126): a name the project bound is the project's.
      const local = scope.externals.get(name);
      if (isFoldableFunction(local)) return callLocal(local, node, scope, host, scope.exportNames?.get(name));

      // F-Eval-CallHelper
      if (isFoldableHelperName(name)) {
        if (scope.depth > 0 && !scope.factory) reject("F-Eval-CallHelper", node, "an authoring helper call inside a folded function body is not foldable");
        return { __helper: name, args: node.arguments.map((a) => arg(a, F)) };
      }

      // F-Eval-CallIntrinsic
      if (host.intrinsics.some((i) => i.name === name && intrinsicCallFolds(i))) {
        if (scope.depth > 0 && !scope.factory) reject("F-Eval-CallIntrinsic", node, "an intrinsic call inside a folded function body is not foldable");
        return { __intrinsic: name, args: node.arguments.map((a) => arg(a, (x) => foldInterior(x, scope, host))) };
      }

      // F-Eval-CallEager
      if (host.intrinsics.some((i) => i.name === name && intrinsicCallFoldsEagerly(i))) {
        if (typeof local !== "function") reject("F-Eval-CallEager", node, `"${name}" did not resolve to a function`);
        const eagerArgs = node.arguments.map((a) => F(a));
        record("F-Eval-CallEager", "eager intrinsic", name);
        return (local as (...a: unknown[]) => unknown)(...eagerArgs);
      }

      // S-FactoryBody rule 5: inside a factory body a call through a bare
      // identifier is admitted: a nested composite, registered or host-published.
      if (scope.factory) {
        if (isCompositeFactory(local)) return interpret(local, node.arguments.map((a) => F(a)), node, scope.depth, host, node.arguments, scope.consts, scope.exportNames?.get(name));
        if (isCompositeDefinition(local) && host.fcall) return host.fcall(node);
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
      const methodArgs = node.arguments.map((a) => F(a));
      record("F-Eval-CallMethod", "method on a real receiver", method);
      return (fn as (...a: unknown[]) => unknown).apply(receiver, methodArgs);
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
      // A const bound to a function is a project-local function, not a value
      // (S-LocalFunction, F-Bind): it binds through collectLocalFunctions.
      if (ts.isIdentifier(d.name) && d.initializer && !isFunctionInitializer(d.initializer)) out.set(d.name.text, d.initializer);
    }
  }
  return out;
}

const isFunctionInitializer = (e: ts.Expression): e is ts.ArrowFunction | ts.FunctionExpression =>
  ts.isArrowFunction(e) || ts.isFunctionExpression(e);

/**
 * S-LocalFunction, F-Bind: every top-level `function` declaration, exported or
 * not, and every top-level `const` bound to an arrow or function expression,
 * as `FoldableFunction` markers for the file's own scope. A call reaches
 * F-Eval-CallLocal; a use as a value is F-Eval-Ident step 3's rejection. The
 * body is judged by S-FnBody at the call, never here (spec 1.2, #95).
 */
export function collectLocalFunctions(
  sf: ts.SourceFile,
  file: string,
  consts: Map<string, ts.Expression>,
  externals: ReadonlyMap<string, unknown>,
  exportNames?: ReadonlyMap<string, string>,
): FoldableFunction[] {
  const out: FoldableFunction[] = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.body && !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
      out.push(new FoldableFunction(st.name.text, st, file, consts, externals, exportNames));
      continue;
    }
    if (!ts.isVariableStatement(st) || (st.declarationList.flags & ts.NodeFlags.Const) === 0) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer && isFunctionInitializer(d.initializer)) {
        out.push(new FoldableFunction(d.name.text, d.initializer, file, consts, externals, exportNames));
      }
    }
  }
  return out;
}

// ── F-Obs-Provenance ────────────────────────────────────────────────────────

/** The provenance half of entering an interpreted call: its writer, its parameters, and where its result's origin goes. */
function callProv(composite: string, call: ts.Node, fn: FnDecl, caller: { consts: ReadonlyMap<string, ts.Expression> }, host: EvalHost, argNodes?: readonly ts.Node[]) {
  const prov = host.prov!;
  const writer: Writer = { kind: "call", composite, call };
  const scope: ProvScope = { writer, names: new Map() };
  const nodes = argNodes ?? (ts.isCallExpression(call) ? call.arguments : []);
  const multi = fn.parameters.length > 1;
  return {
    scope,
    param(i: number, defaulted: boolean): OTree {
      const p = fn.parameters[i];
      const declared = p && ts.isIdentifier(p.name) ? p.name.text : undefined;
      const ref: ParamRef = { composite, call, prefix: multi ? declared : undefined, whole: declared, segments: [], arg: defaulted ? undefined : nodes[i], argConsts: caller.consts };
      return { t: "param", ref };
    },
    done(ret: ts.Node | undefined): void {
      prov.results.set(call, (ret && prov.get(ret)) ?? leaf(writerOrigin(writer, call)));
    },
  };
}

const DIRECT_WRITER: Writer = { kind: "direct" };
const isObjectValue = (v: unknown): boolean => v !== null && typeof v === "object";

/**
 * The origin of `node`'s value, from its direct sub-evaluations in `frame`.
 * Mirrors foldRaw's branches; a child absent from the frame was not evaluated.
 */
function originOf(node: ts.Expression, v: unknown, scope: Scope, frame: Map<ts.Node, { v: unknown; o: OTree }>, p: ProvState): OTree {
  const w = scope.prov?.writer ?? DIRECT_WRITER;
  const at = (n: ts.Node | undefined): OTree | undefined => (n ? frame.get(n)?.o : undefined);
  const lit = (): OTree => leaf(writerOrigin(w, node));
  const der = (ns: readonly (ts.Node | undefined)[]): OTree => derive(w, node, ns.flatMap((n) => { const o = at(n); return o ? [o] : []; }));
  const hostCall: OTree = leaf({ kind: "unknown", reason: "host-call" });

  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) return at(node.expression) ?? lit();

  if (ts.isIdentifier(node)) {
    const name = node.text;
    const bound = scope.prov?.names.get(name);
    if (bound) return bound;
    if (scope.consts.has(name)) return at(scope.consts.get(name)) ?? lit();
    return lit();
  }

  if (ts.isTaggedTemplateExpression(node)) return ts.isNoSubstitutionTemplateLiteral(node.template) ? lit() : der(node.template.templateSpans.map((s) => s.expression));
  if (ts.isTemplateExpression(node)) return der(node.templateSpans.map((s) => s.expression));

  if (ts.isObjectLiteralExpression(node)) {
    const kids = new Map<string, OTree>();
    for (const m of node.properties) {
      if (ts.isPropertyAssignment(m)) { kids.set((m.name as ts.Identifier).text, at(m.initializer) ?? lit()); continue; }
      if (ts.isShorthandPropertyAssignment(m)) { kids.set(m.name.text, at(m.name) ?? lit()); continue; }
      if (ts.isSpreadAssignment(m)) {
        const src = frame.get(m.expression);
        if (!src || !isObjectValue(src.v)) continue;
        for (const k of Object.keys(src.v as object)) kids.set(k, project(src.o, k));
      }
    }
    return { t: "node", self: writerOrigin(w, node), kids };
  }

  if (ts.isArrayLiteralExpression(node)) {
    const kids = new Map<string, OTree>();
    let i = 0;
    for (const el of node.elements) {
      if (ts.isSpreadElement(el)) {
        const src = frame.get(el.expression);
        if (!src || !Array.isArray(src.v)) continue;
        for (let j = 0; j < src.v.length; j += 1) kids.set(String(i++), project(src.o, String(j)));
      } else kids.set(String(i++), at(el) ?? lit());
    }
    return { t: "node", self: writerOrigin(w, node), kids };
  }

  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    if (ts.isPropertyAccessExpression(node) && isEnvelope(v) && "__compositeStep" in (v as object)) return der((node.expression as ts.CallExpression).arguments);
    const obj = frame.get(node.expression);
    // An attribute reference by name (F-Eval-Member steps 1 and 5) is written here.
    if (!obj || (isEnvelope(obj.v) && "__resource" in (obj.v as object))) return lit();
    const key = ts.isPropertyAccessExpression(node) ? node.name.text : (node.argumentExpression as ts.StringLiteral).text;
    return project(obj.o, key);
  }

  if (ts.isPrefixUnaryExpression(node)) return der([node.operand]);

  if (ts.isBinaryExpression(node)) {
    const K = ts.SyntaxKind;
    const op = node.operatorToken.kind;
    if (op === K.AmpersandAmpersandToken || op === K.BarBarToken || op === K.QuestionQuestionToken) {
      // The value is one side's; a structured one keeps that side's tree, a
      // primitive is governed by every side that was read.
      const right = frame.has(node.right);
      const chosen = right && frame.get(node.right)!.v === v ? node.right : node.left;
      if (!isObjectValue(v)) return der([node.left, right ? node.right : undefined]);
      // A structured default taken because a parameter was absent is still
      // that parameter's: passing it is how the field changes.
      if (chosen === node.right && der([node.left]).t === "leaf" && collapse(der([node.left])).kind === "param") return der([node.left, node.right]);
      return at(chosen) ?? lit();
    }
    return der([node.left, node.right]);
  }

  if (ts.isConditionalExpression(node)) {
    const chosen = frame.has(node.whenTrue) ? node.whenTrue : node.whenFalse;
    return isObjectValue(v) ? (at(chosen) ?? lit()) : der([node.condition, chosen]);
  }

  if (ts.isNewExpression(node)) {
    const args = node.arguments ?? [];
    const kids = new Map<string, OTree>([["__resource", lit()]]);
    const o = v as Record<string, unknown>;
    if (isObjectValue(v) && "props" in o) {
      const propsArg = args.find((a) => ts.isObjectLiteralExpression(a));
      kids.set("props", at(propsArg) ?? lit());
      if ("attributes" in o) kids.set("attributes", at(args[1]) ?? lit());
      if ("args" in o) kids.set("args", { t: "node", self: writerOrigin(w, node), kids: new Map(args.map((a, i) => [String(i), at(a) ?? lit()])) });
    }
    return { t: "node", self: writerOrigin(w, node), kids };
  }

  if (ts.isCallExpression(node)) {
    const r = p.results.get(node);
    if (r) return r;
    if (isEnvelope(v) && ("__helper" in (v as object) || "__intrinsic" in (v as object))) return der(node.arguments);
    // An eager intrinsic, a method on a real receiver, a host composite: host code produced it.
    return hostCall;
  }

  return lit();
}
