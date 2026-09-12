/**
 * J2, the per-file verdict, and J3, the identity-taint fixpoint.
 *
 * Written from `spec/judgments.md` (#21, #22), not derived from any
 * implementation. A project here is a map of path to source; there is no
 * filesystem and no real module system, which is enough for the judgments
 * because both are defined over a finite set of files and the edges between
 * them.
 *
 * Revival (`F-Val-Fate`, #61) runs through the host the caller supplies: a
 * `{__resource}` envelope becomes a real instance of the class the folding
 * file imported, and with `EMPTY_HOST` it stays an envelope, which is an
 * object either way as far as F-Capture's identity test is concerned. What
 * this file does not do is in `CAVEATS.md`.
 */
import { posix } from "node:path";
import * as ts from "typescript";
import { EMPTY_HOST, type Host } from "./host.js";
import { foldExpr, collectConsts, collectLocalFunctions, FoldRejection, FoldableFunction, isFoldableFunction, isLiveObject, CompositeFactory, isCompositeFactory, interpret, type Scope, type EvalHost } from "./fold.js";
import { registerHelpers, registerHostSpecifiers, isHostOwnedSpecifier, isFoldableHelperName } from "./foldable-helpers.js";

/** Marks a declarator initializer that F-Call does not resolve, so J1 does. */
const NOT_FCALL: unique symbol = Symbol("not F-Call");
/** A node's position as (line, column), 1-based, for a located rejection (R9.3). */
function locate(n: ts.Node): [number, number] {
  const { line, character } = n.getSourceFile().getLineAndCharacterOfPosition(n.getStart());
  return [line + 1, character + 1];
}
import { revive } from "./revive.js";
import type { FnDecl } from "./fnbody.js";
import { plainBindingKey } from "./fnbody.js";

export type Verdict =
  | { kind: "fold"; exports: Map<string, unknown>; captures: Set<string> }
  | { kind: "run"; rule: string; reason: string };

const parse = (path: string, source: string) => ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
const isProjectSpecifier = (s: string) => s.startsWith(".") || s.startsWith("/");

/**
 * Resolve a relative specifier against the project's own key set: the
 * specifier joined to the importer's directory and normalised, then the three
 * obvious candidates. `..` segments are resolved; the corpus found a version
 * of this that left `../../config` unjoined, which dropped the import edge and
 * with it the forward taint, so a file chant ran folded here (#96).
 */
function resolveKey(from: string, spec: string, files: ReadonlyMap<string, string>): string | undefined {
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const joined = posix.normalize(base + spec).replace(/^\.\//, "");
  for (const cand of [joined, `${joined}.ts`, `${joined}/index.ts`]) if (files.has(cand)) return cand;
  return undefined;
}

// ── F-Scan: the statement gate of grammar.md §1 ─────────────────────────────
type Declarator =
  | { kind: "resource" | "single"; name: string; expr: ts.Expression }
  | { kind: "destructure"; expr: ts.Expression; elements: { key: string; as: string }[] }
  | { kind: "named-export"; elements: { local: string; as: string }[] }
  | { kind: "re-export"; specifier: string; elements: { imported: string; as: string }[] }
  | { kind: "function"; name: string; fn: FnDecl }
  | { kind: "default"; expr: ts.Expression };

interface Scan { declarators: Declarator[]; disqualified?: string }

function scanExports(sf: ts.SourceFile, admitDefault: boolean): Scan {
  const out: Declarator[] = [];
  for (const st of sf.statements) {
    if (ts.isExportAssignment(st)) {
      // S-ExportDefault (spec 1.2, #94): in data-host, `export default ⟨Expr⟩`
      // is the declarator named `default`; in full it stays S-Disqualify until
      // chant admits it. `export = …` disqualifies in both.
      if (st.isExportEquals || !admitDefault) return { declarators: out, disqualified: "`export default` is not foldable" };
      out.push({ kind: "default", expr: st.expression });
      continue;
    }
    if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly) continue;
      if (!st.exportClause || !ts.isNamedExports(st.exportClause)) {
        return { declarators: out, disqualified: "`export * from` is not foldable" };
      }
      const elements = st.exportClause.elements
        .filter((e) => !e.isTypeOnly)
        .map((e) => ({ imported: (e.propertyName ?? e.name).text, local: (e.propertyName ?? e.name).text, as: e.name.text }));
      if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
        out.push({ kind: "re-export", specifier: st.moduleSpecifier.text, elements });
      } else {
        out.push({ kind: "named-export", elements: elements.map(({ local, as }) => ({ local, as })) });
      }
      continue;
    }
    const exported = (st as { modifiers?: ts.NodeArray<ts.ModifierLike> }).modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (ts.isFunctionDeclaration(st) && exported) {
      if (st.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) || !st.name) {
        return { declarators: out, disqualified: "`export default function` is not foldable" };
      }
      if (st.body) out.push({ kind: "function", name: st.name.text, fn: st });
      continue;
    }
    if (ts.isClassDeclaration(st) && exported) return { declarators: out, disqualified: "an exported class is not foldable" };
    if (!ts.isVariableStatement(st) || !exported) continue;
    if ((st.declarationList.flags & ts.NodeFlags.Const) === 0) {
      return { declarators: out, disqualified: "an exported `let`/`var` is not foldable" };
    }
    for (const d of st.declarationList.declarations) {
      if (!d.initializer) return { declarators: out, disqualified: "an exported uninitialized declaration is not foldable" };
      if (ts.isIdentifier(d.name)) {
        out.push({ kind: ts.isNewExpression(d.initializer) ? "resource" : "single", name: d.name.text, expr: d.initializer });
        continue;
      }
      if (ts.isObjectBindingPattern(d.name)) {
        const elements: { key: string; as: string }[] = [];
        for (const el of d.name.elements) {
          if (el.dotDotDotToken || el.initializer || !ts.isIdentifier(el.name)) {
            return { declarators: out, disqualified: "an exported destructured declaration with a rest, default, or nested element is not foldable" };
          }
          elements.push({ key: ((el.propertyName ?? el.name) as ts.Identifier).text, as: el.name.text });
        }
        out.push({ kind: "destructure", expr: d.initializer, elements });
        continue;
      }
      return { declarators: out, disqualified: "an exported array-destructured declaration is not foldable" };
    }
  }
  return { declarators: out };
}

// ── J2 ──────────────────────────────────────────────────────────────────────
interface Session {
  readonly counters: { factoryInvocations: number; factoryInterpretations: number };
  /** F-Host-Composite: each file's registered composites, read from source, so a caller interprets one whether or not the defining module folds (F-Call step 4). */
  readonly composites: Map<string, Map<string, CompositeFactory>>;
  readonly files: ReadonlyMap<string, string>;
  readonly host: Host;
  /** F-Memo: at most one verdict per file per build. */
  readonly memo: Map<string, Verdict>;
  /** F-Cycle: the resolution stack. */
  readonly stack: string[];
  /** Local functions this build created, so F-CallLeak's flag is observable. */
  readonly locals: Map<string, FoldableFunction[]>;
  /**
   * Every non-primitive in some folded `X(g)`, to the `g` that produced it.
   * F-Capture is stated over `X(f)`, not over what `f` imported, so the edge
   * can only be decided once the namespace exists. F-Memo is what makes the
   * index meaningful: one object per entity, so the first owner is the owner.
   */
  readonly owner: Map<object, string>;
}

/**
 * Index every non-primitive `f` produced, so a later file's capture of one is
 * attributable. "Non-primitive" is F-Identity's reference test, the broad one
 * F-Import uses: a plain object counts, and the walk does not ask whether
 * anything inside it is live.
 */
function indexOwned(value: unknown, file: string, session: Session, seen = new Set<unknown>()): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (!session.owner.has(value)) session.owner.set(value, file);
  // Recurse through plain structure only: an entity's interior belongs to the
  // entity, and reaching into it would attribute its fields to the wrong file.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) return;
  for (const inner of Object.values(value)) indexOwned(inner, file, session, seen);
}

/**
 * F-Capture, decided over the produced namespace: which other files' objects
 * are in `X(f)`.
 *
 * The walk descends through an entity's own properties as well as through
 * plain structure, which is where `indexOwned` above stops. F-Capture asks
 * whether some value in `X(f)` came from `X(g)`, and an object handed to a
 * constructor is still in `X(f)` after the constructor kept it. Stopping at
 * the entity lost the edge entirely for the ordinary case, a shared plain
 * object passed as a resource's `labels`, and the loss was invisible until
 * the corpus ran against a real host (#25): with no host the entity never
 * becomes an instance, so the walk stayed inside plain objects and found the
 * object anyway.
 */
function capturesIn(value: unknown, self: string, session: Session, out: Set<string>, seen = new Set<unknown>()): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  const from = session.owner.get(value);
  if (from !== undefined && from !== self) out.add(from);
  for (const inner of ownData(value)) capturesIn(inner, self, session, out, seen);
}

/**
 * An object's own data properties, enumerable or not, accessors skipped.
 *
 * A host's entity class is free to keep what it was handed wherever it likes,
 * and chant's keeps it on a non-enumerable `props`. `Object.values` cannot see
 * that, so a capture walk built on it reports no capture for the ordinary case
 * of a shared object passed to a constructor. Accessors are skipped rather
 * than invoked: reading one can throw (chant's `AttrRef.toJSON` does, for a
 * reference whose logical name is not yet assigned), and an accessor computes
 * a value rather than holding one.
 */
function ownData(value: object): unknown[] {
  // An object held weakly is still held: an attribute reference keeps its
  // entity behind a `WeakRef`, and the file holding the reference holds the
  // entity for F-Capture's purposes, the same as if it held it directly.
  if (value instanceof WeakRef) {
    const target = value.deref();
    return target === undefined ? [] : [target];
  }
  const out: unknown[] = [];
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) out.push(descriptor.value);
  }
  return out;
}

/** Every value binding a non-type-only import clause introduces. */
function bindingNames(clause: ts.ImportClause): string[] {
  const out: string[] = [];
  if (clause.name) out.push(clause.name.text);
  const nb = clause.namedBindings;
  if (nb && ts.isNamespaceImport(nb)) out.push(nb.name.text);
  if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (!el.isTypeOnly) out.push(el.name.text);
  return out;
}

function verdictOf(path: string, session: Session): Verdict {
  const memo = session.memo.get(path);
  if (memo) return memo;
  if (session.stack.includes(path)) {
    // F-Cycle: a located error naming the cycle, not an infinite regress.
    return { kind: "run", rule: "F-Cycle", reason: `import cycle: ${[...session.stack, path].join(" -> ")}` };
  }
  session.stack.push(path);
  const v = foldFile(path, session);
  session.stack.pop();
  session.memo.set(path, v);
  return v;
}

function foldFile(path: string, session: Session): Verdict {
  const source = session.files.get(path);
  if (source === undefined) return { kind: "run", rule: "F-NotProject", reason: `${path} is not project source` };
  const sf = parse(path, source);

  // F-Scan
  const scan = scanExports(sf, session.host.profile === "data-host");
  if (scan.disqualified) return { kind: "run", rule: "F-Scan", reason: scan.disqualified };
  // F-NoExports
  if (scan.declarators.length === 0) return { kind: "run", rule: "F-NoExports", reason: "no foldable resource exports" };

  // F-Bind
  const consts = collectConsts(sf);
  const externals = new Map<string, unknown>();
  /** Names bound by an import from a host package, with the export each names (F-Host-Trust arm 1). F-Call may invoke these. */
  const hostBound = new Map<string, string>();
  const captures = new Set<string>();
  const mine: FoldableFunction[] = [];
  session.locals.set(path, mine);
  /** F-Import: why a binding was left unresolved, "for diagnostics only". */
  const unresolved = new Map<string, { rule: string; reason: string }>();

  // F-Import
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    const clause = st.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (!isProjectSpecifier(spec)) {
      // F-Import, bare specifier: a package is never a member of F. A host-owned
      // one still binds its REAL exports (F-Host-Trust arm 1), which is what lets
      // revival construct anything at all (F-Val-Fate).
      const supplied = session.host.values.get(spec);
      if (supplied && isHostOwnedSpecifier(spec) && clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          if (el.isTypeOnly) continue;
          const imported = (el.propertyName ?? el.name).text;
          if (supplied.has(imported)) { externals.set(el.name.text, supplied.get(imported)); hostBound.set(el.name.text, imported); }
        }
      }
      continue;
    }
    const target = resolveKey(path, spec, session.files);
    if (!target) continue;
    const tv = verdictOf(target, session);
    if (tv.kind !== "fold") {
      // F-Call step 4: an interpretable composite is read from the defining
      // module's source and the module is never imported, so the binding
      // holds whatever that module's own verdict was. Everything else the
      // module exports is not resolved, and the cause is kept for F-Reason.
      const registered = session.composites.get(target);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          const factory = registered?.get((el.propertyName ?? el.name).text);
          if (factory) externals.set(el.name.text, factory);
        }
      }
      for (const n of bindingNames(clause)) if (!externals.has(n)) unresolved.set(n, { rule: tv.rule, reason: tv.reason });
      continue;
    }
    if (clause.name && tv.exports.has("default")) {
      // `import n from "./g"` binds the target's default export (S-ExportDefault, spec 1.2).
      const value = tv.exports.get("default");
      externals.set(clause.name.text, value);
      if (value !== null && typeof value === "object" && !isFoldableFunction(value)) captures.add(target);
    }
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      // F-Namespace: a synthetic plain object of the target's entries.
      const ns = Object.fromEntries(tv.exports);
      externals.set(clause.namedBindings.name.text, ns);
      continue;
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        if (el.isTypeOnly) continue;
        const imported = (el.propertyName ?? el.name).text;
        if (!tv.exports.has(imported)) continue;
        const value = tv.exports.get(imported);
        externals.set(el.name.text, value);
        // F-Import: an imported value with identity is a capture at the
        // import, by F-Identity's reference test, whether or not it reaches
        // X(f). A project-local function is a callable, not a value, and
        // F-CallLeak decides its edge at the call instead. The corpus found
        // the walk over X(f) below is not enough on its own: a file that
        // reads only primitives out of an imported object holds no object in
        // its namespace, and chant taints it anyway, as the text says (#96).
        if (value !== null && typeof value === "object" && !isFoldableFunction(value)) captures.add(target);
      }
    }
  }

  // F-Declarator, into X
  const scope: Scope = { consts, externals, depth: 0, captures };
  const counters = session.counters;
  const evalHost: EvalHost = {
    intrinsics: session.host.intrinsics,
    live: (v, node, what) => live(v, node, what),
    reviveIn: (bindings, v, node, what) => {
      if (session.host.profile === "data-host") return v;
      const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart());
      return revive(v, bindings, { line: line + 1, column: character + 1, what, call: byName });
    },
    hostBound: new Set(hostBound.keys()),
    counters,
  };
  const exports = new Map<string, unknown>();
  /**
   * F-Val-Fate: what the declarator produced, revived through this file's own
   * imports. In `data-host` revival is serialization (F-Profile-DataHost): no
   * constructor and no function is invoked, and the envelope is the output.
   */
  const live = (v: unknown, node: ts.Node, what: string): unknown => {
    if (session.host.profile === "data-host") return v;
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart());
    return revive(v, externals, { line: line + 1, column: character + 1, what, call: byName });
  };

  // F-Bind, S-LocalFunction: the file's own functions, exported or not, bound
  // before anything can call them. The exported ones are also declarators
  // below, and reuse the same marker so F-CallLeak's flag is one object.
  // F-Host-Composite: `const N = Composite(fn, "N")` with Composite bound to the
  // host's own import makes N interpretable. Like a local function it is a
  // binding in externals and not a const (F-Bind); a call reaches F-Call.
  for (const [name, init] of consts) {
    if (!ts.isCallExpression(init) || !ts.isIdentifier(init.expression) || hostBound.get(init.expression.text) !== "Composite") continue;
    const [fn, label] = init.arguments;
    if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) continue;
    if (label && !ts.isStringLiteral(label)) continue;
    externals.set(name, new CompositeFactory(name, fn, path, consts, externals));
  }
  for (const name of [...consts.keys()]) if (isCompositeFactory(externals.get(name))) consts.delete(name);
  session.composites.set(path, new Map([...externals].filter((e): e is [string, CompositeFactory] => isCompositeFactory(e[1]))));

  /**
   * F-Call: a call in declarator position whose callee is a registered project
   * composite (step 4, interpreted) or a host-bound factory (step 6, invoked
   * once per call site, F-Count). Any other callee is J1's, or J1's rejection.
   */
  const callMemo = new Map<ts.CallExpression, unknown>();
  const fCallable = (c: ts.Expression): c is ts.Identifier => ts.isIdentifier(c) && !consts.has(c.text) && (isCompositeFactory(externals.get(c.text)) || (hostBound.has(c.text) && typeof externals.get(c.text) === "function" && !isFoldableHelperName(c.text) && !session.host.intrinsics.some((i) => i.name === c.text)));
  const fCall = (call: ts.CallExpression, indexed = false): unknown => {
    if (callMemo.has(call)) return callMemo.get(call);
    const c = call.expression as ts.Identifier;
    const bound = externals.get(c.text);
    const folded = call.arguments.map((a) => {
      if (ts.isSpreadElement(a)) throw new FoldRejection("F-Call", ...locate(a), `a spread argument to "${c.text}" is not foldable`);
      return foldExpr(a, scope, evalHost);
    });
    let result: unknown;
    if (isCompositeFactory(bound)) {
      result = live(interpret(bound, folded, call, 0, evalHost), call, c.text);
    } else {
      // Step 6: invoked with the resolved arguments; a live argument passes through and an attribute reference stays symbolic (L6.9).
      const args = folded.map((v, i) => live(v, call.arguments[i], c.text));
      counters.factoryInvocations += 1;
      try {
        result = (bound as (...a: unknown[]) => unknown)(...args);
      } catch (err) {
        // A factory that throws, a class called without `new` among them, is a run at the declarator (F-Call), never a crash.
        throw new FoldRejection("F-Call", ...locate(call), `invoking "${c.text}" threw: ${err instanceof Error ? err.message : String(err)}`);
      }
      // Step 7: the result must be an entity or a composite instance; a
      // destructured or member-read result need only be indexable (F-Declarator).
      if (indexed ? result === null || typeof result !== "object" : !isLiveObject(result)) throw new FoldRejection("F-Call", ...locate(call), `"${c.text}" returned plain data, not an entity or a composite instance`);
    }
    callMemo.set(call, result);
    return result;
  };
  const byName = (callee: string, args: unknown[]): unknown => {
    const bound = externals.get(callee);
    if (isCompositeFactory(bound)) return live(interpret(bound, args, sf, 0, evalHost), sf, callee);
    if (hostBound.has(callee) && typeof bound === "function") {
      counters.factoryInvocations += 1;
      let r: unknown;
      try { r = (bound as (...a: unknown[]) => unknown)(...args); }
      catch (err) { throw new FoldRejection("F-Call", 1, 1, `invoking "${callee}" threw: ${err instanceof Error ? err.message : String(err)}`); }
      if (!isLiveObject(r)) throw new FoldRejection("F-Call", 1, 1, `"${callee}" returned plain data, not an entity or a composite instance`);
      return r;
    }
    throw new FoldRejection("F-Call", 1, 1, `"${callee}" is not a composite this build can resolve`);
  };
  /** A declarator initializer J2 resolves through F-Call rather than J1: a call, or a member or element access on one. */
  const viaFCall = (e: ts.Expression, indexed = false): unknown | undefined => {
    const inner = ts.isParenthesizedExpression(e) ? e.expression : e;
    if (ts.isCallExpression(inner) && fCallable(inner.expression)) return fCall(inner, indexed);
    if ((ts.isPropertyAccessExpression(inner) || ts.isElementAccessExpression(inner)) && ts.isCallExpression(inner.expression) && fCallable(inner.expression.expression)) {
      const base = fCall(inner.expression, true);
      if (base === null || typeof base !== "object") throw new FoldRejection("F-Call", ...locate(inner), "a member read on a call's result needs an indexable object");
      const key = ts.isPropertyAccessExpression(inner) ? inner.name.text : ts.isStringLiteral(inner.argumentExpression) || ts.isNumericLiteral(inner.argumentExpression) ? inner.argumentExpression.text : undefined;
      if (key === undefined) throw new FoldRejection("F-Eval-Index", ...locate(inner), "a non-literal element-access key is not foldable");
      return (base as Record<string, unknown>)[key];
    }
    return NOT_FCALL;
  };

  for (const fn of collectLocalFunctions(sf, path, consts, externals)) {
    mine.push(fn);
    externals.set(fn.name, fn);
  }

  // F-Bind: destructured locals from a composite call, `const { a } = C({…})`,
  // are bindings the resolver may read by name. A call that fails leaves them
  // unbound, and a later reference is F-Reference's rejection.
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || (st.declarationList.flags & ts.NodeFlags.Const) === 0) continue;
    if (st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isObjectBindingPattern(d.name) || !d.initializer || !ts.isCallExpression(d.initializer) || !fCallable(d.initializer.expression)) continue;
      try {
        const base = fCall(d.initializer, true);
        if (base === null || typeof base !== "object") continue;
        for (const el of d.name.elements) {
          if (el.dotDotDotToken || el.initializer || !ts.isIdentifier(el.name)) continue;
          const key = plainBindingKey(el);
          if (key) externals.set(el.name.text, (base as Record<string, unknown>)[key]);
        }
      } catch (e) {
        if (!(e instanceof FoldRejection)) throw e;
      }
    }
  }


  // F-Prebuild: every same-file `const n = new T(…)`, exported or not, built
  // once in source order before any declarator reads it, and bound in
  // `externals` where F-Eval-Ident step 1 looks. A construction that fails is
  // skipped rather than failing the file here: the name stays unbound, a
  // reference to it rejects under step 1, and an exported one reproduces the
  // failure below with its own located reason. `collectConsts` yields source
  // order, so a later construction sees an earlier one (#68).
  const prebuilt = new Map<ts.Expression, unknown>();
  for (const [name, init] of consts) {
    if (!ts.isNewExpression(init)) continue;
    try {
      const instance = live(foldExpr(init, scope, evalHost), init, name);
      prebuilt.set(init, instance);
      externals.set(name, instance);
    } catch (e) {
      if (!(e instanceof FoldRejection)) throw e;
    }
  }

  for (const d of scan.declarators) {
    try {
      if (d.kind === "resource") {
        // F-Count: the instance F-Prebuild built for this initializer is the
        // one exported; a second construction would be a second entity.
        exports.set(d.name, prebuilt.has(d.expr) ? prebuilt.get(d.expr) : live(foldExpr(d.expr, scope, evalHost), d.expr, d.name));
      } else if (d.kind === "single") {
        const viaCall = viaFCall(d.expr);
        exports.set(d.name, viaCall !== NOT_FCALL ? viaCall : live(foldExpr(d.expr, scope, evalHost), d.expr, d.name));
      } else if (d.kind === "destructure") {
        const viaCall = viaFCall(d.expr, true);
        const base = viaCall !== NOT_FCALL ? viaCall : live(foldExpr(d.expr, scope, evalHost), d.expr, "a destructured declaration");
        if (base === null || typeof base !== "object") {
          return { kind: "run", rule: "F-Declarator", reason: "destructured source is not an object" };
        }
        for (const el of d.elements) exports.set(el.as, (base as Record<string, unknown>)[el.key]);
      } else if (d.kind === "named-export") {
        for (const el of d.elements) {
          const init = consts.get(el.local);
          // Through F-Eval-Ident, never by re-folding the initializer: a name
          // bound to a same-file `new` reads F-Prebuild's instance, and a
          // failed one reproduces step 1's rejection rather than building a
          // second entity here.
          const v =
            init && ts.isNewExpression(init)
              ? prebuilt.has(init)
                ? prebuilt.get(init)
                : live(foldExpr(init, scope, evalHost), init, el.as)
              : init
                ? live(foldExpr(init, scope, evalHost), init, el.as)
                : externals.get(el.local);
          if (v === undefined && !consts.has(el.local) && !externals.has(el.local)) {
            return { kind: "run", rule: "F-Reference", reason: `unresolved identifier: ${el.local}` };
          }
          exports.set(el.as, v);
        }
      } else if (d.kind === "re-export") {
        const target = resolveKey(path, d.specifier, session.files);
        if (!target) return { kind: "run", rule: "F-Import", reason: `cannot resolve re-export from ${d.specifier}` };
        const tv = verdictOf(target, session);
        if (tv.kind !== "fold") return { kind: "run", rule: "F-Import", reason: `re-export source ${target} falls back to run` };
        // A re-export is a capture, and the owner index below records it as one.
        for (const el of d.elements) exports.set(el.as, tv.exports.get(el.imported));
      } else if (d.kind === "function") {
        exports.set(d.name, externals.get(d.name));
      } else if (d.kind === "default") {
        const viaCall = viaFCall(d.expr);
        exports.set("default", viaCall !== NOT_FCALL ? viaCall : live(foldExpr(d.expr, scope, evalHost), d.expr, "default"));
      }
    } catch (e) {
      // F-Total: one failed declarator is a failure of the whole file. F-Reason.
      if (e instanceof FoldRejection) {
        // F-Reason: an unresolved identifier that came from an unresolved import
        // reports the import's own cause, not just the bare name.
        const name = /unresolved identifier: (\w+)$/.exec(e.message)?.[1];
        const cause = name ? unresolved.get(name) : undefined;
        if (cause) {
          const rule = cause.rule === "F-Cycle" ? "F-Cycle" : "F-Import";
          return { kind: "run", rule, reason: `${e.message} (its module falls back to run: ${cause.reason})` };
        }
        return { kind: "run", rule: e.rule, reason: e.message };
      }
      throw e;
    }
  }
  // F-Capture over X(f). F-CallLeak has already put its own edges in `captures`.
  for (const v of exports.values()) capturesIn(v, path, session, captures);
  for (const v of exports.values()) indexOwned(v, path, session);
  return { kind: "fold", exports, captures };
}

// ── J3 ──────────────────────────────────────────────────────────────────────
export interface ProjectResult {
  /** Final verdicts, after the fixpoint. */
  readonly verdicts: Map<string, Verdict>;
  /** Tentative J2 verdicts, before J3 disposed of them. */
  readonly tentative: Map<string, Verdict>;
  /** Why a file that reduced on its own was nonetheless tainted. */
  readonly taintReason: Map<string, string>;
  /** The file whose taint reached it, the other end of the F-Succ edge that fired. */
  readonly taintSource: Map<string, string>;
  /** F-Obs-Counters: host factories invoked and project composites interpreted in this build. */
  readonly counters: { factoryInvocations: number; factoryInterpretations: number };
}

export function foldProject(files: ReadonlyMap<string, string>, host: Host = EMPTY_HOST): ProjectResult {
  registerHelpers(host.helpers);
  registerHostSpecifiers(host.ownedSpecifierPrefixes);
  const session: Session = { files, host, memo: new Map(), stack: [], locals: new Map(), owner: new Map(), counters: { factoryInvocations: 0, factoryInterpretations: 0 }, composites: new Map() };

  const tentative = new Map<string, Verdict>();
  for (const path of files.keys()) tentative.set(path, verdictOf(path, session));

  // Edges. Forward: f imports g. Backward: c captured from f.
  const imports = new Map<string, Set<string>>();
  for (const [path, source] of files) {
    const set = new Set<string>();
    for (const st of parse(path, source).statements) {
      const spec =
        (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)
          ? st.moduleSpecifier.text
          : undefined;
      if (!spec || !isProjectSpecifier(spec)) continue;
      const target = resolveKey(path, spec, files);
      if (target) set.add(target);
    }
    imports.set(path, set);
  }

  // F-Profile-DataHost: J3 is absent. Nothing runs, so nothing taints, and
  // every file's verdict is its own.
  if (host.profile === "data-host") {
    return { verdicts: new Map(tentative), tentative, taintReason: new Map(), taintSource: new Map(), counters: session.counters };
  }

  // F-Succ. Both directions from one tainted file.
  const succ = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    if (!succ.has(from)) succ.set(from, new Set());
    succ.get(from)!.add(to);
  };
  for (const [f, gs] of imports) for (const g of gs) add(f, g); // forward: f taints what it imports
  for (const [c, v] of tentative) {
    if (v.kind !== "fold") continue;
    for (const source of v.captures) add(source, c); // backward: the captured source taints the capturer
  }
  // F-Seed, F-Taint, F-Fix: least fixpoint by worklist over a finite set.
  const tainted = new Set<string>([...tentative].filter(([, v]) => v.kind !== "fold").map(([p]) => p));
  const reason = new Map<string, string>();
  const source = new Map<string, string>();
  const queue = [...tainted];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of succ.get(current) ?? []) {
      if (tainted.has(next)) continue;
      tainted.add(next);
      source.set(next, current);
      // F-Reason for a taint: name the edge that fired. The forward edge is the
      // one a reader can see in the file's own imports; the backward edge is the
      // one nothing in the file predicts, so it has to be spelled out.
      reason.set(
        next,
        imports.get(current)?.has(next)
          ? `would fold in isolation, but ${current}, which imports it, falls back to run`
          : `would fold in isolation, but it captured objects from ${current}, which falls back to run`,
      );
      queue.push(next);
    }
  }

  // F-Verdict
  const verdicts = new Map<string, Verdict>();
  for (const [path, v] of tentative) {
    verdicts.set(
      path,
      tainted.has(path) && v.kind === "fold" ? { kind: "run", rule: "F-Taint", reason: reason.get(path) ?? "tainted" } : v,
    );
  }
  return { verdicts, tentative, taintReason: reason, taintSource: source, counters: session.counters };
}
