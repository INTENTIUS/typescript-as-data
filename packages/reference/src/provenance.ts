/**
 * F-Obs-Provenance (spec 2.2): for every path a fold emits, which writer
 * produced it. The reference reports it, because it interprets project
 * functions (S-LocalFunction, S-CallLocal, F-Call step 4) rather than calling
 * them, so the expression each field was written as is in hand while folding.
 *
 * ## The four kinds
 *
 * - `direct`: the value was written at the export, outside any interpreted
 *   project function, so the edit belongs at the declaration.
 * - `composite-parameter`: an interpreted function's parameter produced the
 *   value. `composite` names the function, `parameters` the parameter paths it
 *   was read from, `call` where the call was written and `arguments` where each
 *   argument was written at that call.
 * - `composite-literal`: the function's body fixes the value. `literal` is
 *   where the body wrote it.
 * - `unknown`: nothing attributes the value, a host call's result for one.
 *   An `unknown` is never reported as `direct`.
 *
 * The innermost writer wins: in `f` calling `g`, a field `g` reads from its
 * own parameter is `g`'s, whatever `f` passed.
 *
 * ## Paths
 *
 * A path starts with the export name and continues with the property path in
 * the folded value, written the way a TypeScript accessor is: `.key` for a key
 * that is an identifier, `["key"]` (JSON-quoted) for any other key, `[n]` for
 * an array element. `bucket.props.tags["app.kubernetes.io/name"]`, `ports[0]`.
 * Only leaves are reported: a primitive, an empty object or array. A live
 * instance in `full` is descended through its enumerable keys, as a fixture's
 * `exports` writes it. A key whose value is `undefined` is not emitted and
 * has no path.
 *
 * ## Parameter paths
 *
 * Dotted, as chant writes them. For a function of one parameter the path is
 * relative to the argument (`name`, `tags.env`), and a read of the whole
 * argument names the parameter as declared. For a function of several, the
 * declared name comes first (`opts.tags.env`); a destructured parameter among
 * several contributes its keys alone. A parameter whose argument was omitted
 * and whose default applied is still that parameter, with no argument
 * location: passing the argument is how the field changes.
 */
import * as ts from "typescript";

/** A position in project source, 1-based. `file` is the project path the build was given. */
export interface SourceLocation { file: string; line: number; column: number }

/** Why a path's origin could not be determined. */
export type UnknownOriginReason =
  /** A host function produced the value: an eager intrinsic, a method on a real receiver, a host factory. */
  | "host-call"
  /** A value a host package exports, bound by an import (F-Host-Trust arm 1). */
  | "host-value";

/** What produced one emitted path. The kinds and their fields follow chant's `FoldFieldOrigin`, plus source locations. */
export type FoldFieldOrigin =
  | { kind: "direct" }
  | {
      kind: "composite-parameter";
      composite: string;
      /** The export whose initializer is this call, when it is one. */
      instance?: string;
      parameters: string[];
      call?: SourceLocation;
      /** Per parameter path, where its argument was written at the call. Absent for a parameter whose default applied. */
      arguments?: Record<string, SourceLocation>;
    }
  | { kind: "composite-literal"; composite: string; instance?: string; call?: SourceLocation; literal?: SourceLocation }
  | { kind: "unknown"; reason: UnknownOriginReason };

/** One export's provenance: every path it emits, to that path's origin. */
export type ExportProvenance = Record<string, FoldFieldOrigin>;

// ── internal: origin trees ──────────────────────────────────────────────────

/** The writer a literal belongs to: the export itself, or one interpreted call. */
export type Writer = { kind: "direct" } | { kind: "call"; composite: string; call: ts.Node };

/** A parameter reference: the value bound to a parameter, or a path inside it. */
export interface ParamRef {
  composite: string;
  call: ts.Node;
  /** The declared name, for a multi-parameter function; undefined for a single parameter. */
  prefix?: string;
  /** The declared name of a single identifier parameter, which names a read of the whole argument. */
  whole?: string;
  segments: string[];
  /** Where the argument (or the part of it this path addresses) was written; undefined when a default applied. */
  arg?: ts.Node;
  /** The caller's consts, so an identifier argument is followed to its initializer. */
  argConsts?: ReadonlyMap<string, ts.Expression>;
}

export type Origin =
  | { kind: "direct" }
  | { kind: "literal"; composite: string; call: ts.Node; at: ts.Node }
  | { kind: "param"; refs: ParamRef[] }
  | { kind: "unknown"; reason: UnknownOriginReason };

/**
 * An origin for a whole value. `leaf` governs every path under it; `node` is
 * an object or array built here, with its members' trees; `param` is a
 * parameter, projected lazily as paths are read from it.
 */
export type OTree =
  | { t: "leaf"; o: Origin }
  | { t: "node"; self: Origin; kids: Map<string, OTree> }
  | { t: "param"; ref: ParamRef };

export const leaf = (o: Origin): OTree => ({ t: "leaf", o });
export const DIRECT: OTree = leaf({ kind: "direct" });

/** The origin of a literal the current writer wrote at `at`. */
export function writerOrigin(w: Writer, at: ts.Node): Origin {
  return w.kind === "direct" ? { kind: "direct" } : { kind: "literal", composite: w.composite, call: w.call, at };
}

const unwrapNode = (e: ts.Node): ts.Node =>
  ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e) ? unwrapNode(e.expression) : e;

/** The part of an argument expression a key addresses, followed through the caller's consts; undefined when it cannot be found syntactically. */
function descend(node: ts.Node, key: string, consts: ReadonlyMap<string, ts.Expression> | undefined, seen = new Set<string>()): ts.Node | undefined {
  const n = unwrapNode(node);
  if (ts.isIdentifier(n) && consts?.has(n.text) && !seen.has(n.text)) {
    seen.add(n.text);
    return descend(consts.get(n.text)!, key, consts, seen);
  }
  if (ts.isObjectLiteralExpression(n)) {
    let hit: ts.Node | undefined;
    for (const m of n.properties) {
      if (ts.isPropertyAssignment(m) && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) || ts.isNumericLiteral(m.name)) && m.name.text === key) hit = m.initializer;
      else if (ts.isShorthandPropertyAssignment(m) && m.name.text === key) hit = m;
      else if (ts.isSpreadAssignment(m)) hit = undefined; // a later spread may overwrite it; say nothing rather than guess
    }
    return hit;
  }
  if (ts.isArrayLiteralExpression(n) && /^\d+$/.test(key)) {
    const i = Number(key);
    if (n.elements.slice(0, i + 1).some((e) => ts.isSpreadElement(e))) return undefined;
    return n.elements[i];
  }
  return undefined;
}

/** The subtree for one key of a value. */
export function project(tree: OTree, key: string): OTree {
  if (tree.t === "leaf") return tree;
  if (tree.t === "node") return tree.kids.get(key) ?? leaf(tree.self);
  const r = tree.ref;
  const arg = r.arg ? (descend(r.arg, key, r.argConsts) ?? r.arg) : undefined;
  return { t: "param", ref: { ...r, segments: [...r.segments, key], arg } };
}

/** The origin of a value taken whole. */
export function collapse(tree: OTree): Origin {
  if (tree.t === "leaf") return tree.o;
  if (tree.t === "node") return tree.self;
  return { kind: "param", refs: [tree.ref] };
}

function leaves(tree: OTree, out: Origin[]): Origin[] {
  if (tree.t === "node") { out.push(tree.self); for (const k of tree.kids.values()) leaves(k, out); }
  else out.push(collapse(tree));
  return out;
}

/**
 * A value computed from others at `at` (an operator, a template, an
 * intrinsic's envelope): the current writer wrote it. An unknown operand makes
 * it unknown. Inside a call, it is that call's parameter when it reads one of
 * that call's parameters, and the call's literal otherwise.
 */
export function derive(w: Writer, at: ts.Node, operands: OTree[]): OTree {
  const all = operands.flatMap((t) => leaves(t, []));
  const unknown = all.find((o) => o.kind === "unknown");
  if (unknown) return leaf(unknown);
  if (w.kind === "direct") return DIRECT;
  const refs = all.flatMap((o) => (o.kind === "param" ? o.refs : [])).filter((r) => r.call === w.call);
  if (refs.length > 0) return leaf({ kind: "param", refs });
  return leaf(writerOrigin(w, at));
}

// ── emission ────────────────────────────────────────────────────────────────

const IDENT = /^[A-Za-z_$][\w$]*$/;
/** A path segment as an accessor: `.key`, `["key"]`, or `[n]` for an array index. */
export const segment = (key: string, index: boolean): string => (index ? `[${key}]` : IDENT.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`);

function locOf(n: ts.Node): SourceLocation {
  const sf = n.getSourceFile();
  const { line, character } = sf.getLineAndCharacterOfPosition(n.getStart());
  return { file: sf.fileName, line: line + 1, column: character + 1 };
}

function paramName(r: ParamRef): string {
  if (r.segments.length === 0) return r.prefix ?? r.whole ?? "";
  return [...(r.prefix ? [r.prefix] : []), ...r.segments].join(".");
}

function publicOrigin(o: Origin, instanceOf: (call: ts.Node) => string | undefined): FoldFieldOrigin {
  switch (o.kind) {
    case "direct": return { kind: "direct" };
    case "unknown": return { kind: "unknown", reason: o.reason };
    case "literal": {
      const instance = instanceOf(o.call);
      return { kind: "composite-literal", composite: o.composite, ...(instance ? { instance } : {}), call: locOf(o.call), literal: locOf(o.at) };
    }
    case "param": {
      const first = o.refs[0];
      const instance = instanceOf(first.call);
      const parameters = [...new Set(o.refs.map(paramName))].sort();
      const args: Record<string, SourceLocation> = {};
      for (const r of o.refs) if (r.arg) args[paramName(r)] ??= locOf(r.arg);
      return {
        kind: "composite-parameter",
        composite: first.composite,
        ...(instance ? { instance } : {}),
        parameters,
        call: locOf(first.call),
        ...(Object.keys(args).length > 0 ? { arguments: args } : {}),
      };
    }
  }
}


/**
 * Every path one export emits, to its origin. `declarator` is the export's
 * initializer, so a call written there names the export as its `instance`.
 */
export function exportProvenance(name: string, value: unknown, tree: OTree, declarator?: ts.Node): ExportProvenance {
  const top = declarator ? unwrapNode(declarator) : undefined;
  const instanceOf = (call: ts.Node) => (call === top ? name : undefined);
  const out: ExportProvenance = {};
  const seen = new Set<object>();
  const walk = (v: unknown, t: OTree, path: string): void => {
    if (v === undefined) return;
    // Enumerable keys, as a fixture's `exports` writes a value: a live instance
    // in `full` is descended the same way, and a revisited one is a leaf.
    if (v !== null && typeof v === "object" && !seen.has(v)) {
      seen.add(v);
      const arr = Array.isArray(v);
      const keys = Object.keys(v);
      if (keys.length > 0) {
        for (const k of keys) walk((v as Record<string, unknown>)[k], project(t, k), path + segment(k, arr));
        return;
      }
    }
    out[path] = publicOrigin(collapse(t), instanceOf);
  };
  walk(value, tree, name);
  return out;
}
