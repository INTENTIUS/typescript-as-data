/**
 * J2, the per-file verdict, and J3, the identity-taint fixpoint.
 *
 * Written from `spec/judgments.md` (#21, #22), not derived from any
 * implementation. A project here is a map of path to source; there is no
 * filesystem and no real module system, which is enough for the judgments
 * because both are defined over a finite set of files and the edges between
 * them.
 *
 * What this cannot do is revive (`F-Val-Fate`). Revival needs a host that
 * supplies real constructors, and the reference ships an empty one, so a
 * `{__resource}` envelope stays an envelope in the namespace. That does not
 * change a verdict: the capture test in `F-Import` asks whether a value has
 * identity, and an envelope is an object either way.
 */
import * as ts from "typescript";
import { EMPTY_HOST, type Host } from "./host";
import { foldExpr, collectConsts, FoldRejection, FoldableFunction, type Scope } from "./fold";
import { registerHelpers, registerHostSpecifiers, isHostOwnedSpecifier } from "./foldable-helpers";
import { revive } from "./revive";
import type { FnDecl } from "./fnbody";

export type Verdict =
  | { kind: "fold"; exports: Map<string, unknown>; captures: Set<string> }
  | { kind: "run"; rule: string; reason: string };

const parse = (path: string, source: string) => ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
const isProjectSpecifier = (s: string) => s.startsWith(".") || s.startsWith("/");

/** Resolve a relative specifier against the project's own key set. */
function resolveKey(from: string, spec: string, files: ReadonlyMap<string, string>): string | undefined {
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const joined = spec.startsWith("./") ? base + spec.slice(2) : spec.startsWith("../") ? spec : base + spec;
  for (const cand of [joined, `${joined}.ts`, `${joined}/index.ts`]) if (files.has(cand)) return cand;
  return undefined;
}

// ── F-Scan: the statement gate of grammar.md §1 ─────────────────────────────
type Declarator =
  | { kind: "resource" | "single"; name: string; expr: ts.Expression }
  | { kind: "destructure"; expr: ts.Expression; elements: { key: string; as: string }[] }
  | { kind: "named-export"; elements: { local: string; as: string }[] }
  | { kind: "re-export"; specifier: string; elements: { imported: string; as: string }[] }
  | { kind: "function"; name: string; fn: FnDecl };

interface Scan { declarators: Declarator[]; disqualified?: string }

function scanExports(sf: ts.SourceFile): Scan {
  const out: Declarator[] = [];
  for (const st of sf.statements) {
    if (ts.isExportAssignment(st)) return { declarators: out, disqualified: "`export default` is not foldable" };
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
        return { declarators: out, disqualified: "`export default` is not foldable" };
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

/** F-Capture, decided over the produced namespace: which other files' objects are in `X(f)`. */
function capturesIn(value: unknown, self: string, session: Session, out: Set<string>, seen = new Set<unknown>()): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  const from = session.owner.get(value);
  if (from !== undefined && from !== self) out.add(from);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) return;
  for (const inner of Object.values(value)) capturesIn(inner, self, session, out, seen);
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
  const scan = scanExports(sf);
  if (scan.disqualified) return { kind: "run", rule: "F-Scan", reason: scan.disqualified };
  // F-NoExports
  if (scan.declarators.length === 0) return { kind: "run", rule: "F-NoExports", reason: "no foldable resource exports" };

  // F-Bind
  const consts = collectConsts(sf);
  const externals = new Map<string, unknown>();
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
          if (supplied.has(imported)) externals.set(el.name.text, supplied.get(imported));
        }
      }
      continue;
    }
    const target = resolveKey(path, spec, session.files);
    if (!target) continue;
    const tv = verdictOf(target, session);
    if (tv.kind !== "fold") {
      // F-Import: the binding is not resolved, and the cause is kept for F-Reason.
      for (const n of bindingNames(clause)) unresolved.set(n, { rule: tv.rule, reason: tv.reason });
      continue;
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
      }
    }
  }

  // F-Declarator, into X
  const scope: Scope = { consts, externals, depth: 0, captures };
  const evalHost = { intrinsics: session.host.intrinsics };
  const exports = new Map<string, unknown>();
  /** F-Val-Fate: what the declarator produced, revived through this file's own imports. */
  const live = (v: unknown, node: ts.Node, what: string) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart());
    return revive(v, externals, { line: line + 1, column: character + 1, what });
  };
  for (const d of scan.declarators) {
    try {
      if (d.kind === "resource" || d.kind === "single") {
        exports.set(d.name, live(foldExpr(d.expr, scope, evalHost), d.expr, d.name));
      } else if (d.kind === "destructure") {
        const base = live(foldExpr(d.expr, scope, evalHost), d.expr, "a destructured declaration");
        if (base === null || typeof base !== "object") {
          return { kind: "run", rule: "F-Declarator", reason: "destructured source is not an object" };
        }
        for (const el of d.elements) exports.set(el.as, (base as Record<string, unknown>)[el.key]);
      } else if (d.kind === "named-export") {
        for (const el of d.elements) {
          const init = consts.get(el.local);
          const v = init ? live(foldExpr(init, scope, evalHost), init, el.as) : externals.get(el.local);
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
        const marker = new FoldableFunction(d.name, d.fn, path, consts, externals);
        mine.push(marker);
        externals.set(d.name, marker);
        exports.set(d.name, marker);
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
}

export function foldProject(files: ReadonlyMap<string, string>, host: Host = EMPTY_HOST): ProjectResult {
  registerHelpers(host.helpers);
  registerHostSpecifiers(host.ownedSpecifierPrefixes);
  const session: Session = { files, host, memo: new Map(), stack: [], locals: new Map(), owner: new Map() };

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
  return { verdicts, tentative, taintReason: reason, taintSource: source };
}
