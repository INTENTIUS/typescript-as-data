/**
 * F-Val-Fate: revival. A folded tree holds envelopes, values that *denote*
 * something not yet constructed; revival walks the tree and replaces each one
 * by resolving its name through the folding file's own imports and invoking
 * the real constructor or function the host supplies (#61).
 *
 * Written from `spec/values.md`. Five of the six envelope kinds are here.
 * `__compositeStep` is not: its fate is "resolve the composite (J2 F-Call),
 * then read `.step` off the real result", and this implementation has no
 * composite factory form, so it rejects rather than guessing. See CAVEATS.md.
 *
 * Revival is J2's step, not J1's. `foldExpr` yields envelopes and that is the
 * answer the expression fixtures compare; `F-Declarator` revives what the
 * declarator produced.
 */
import { FoldRejection, isEnvelope, isLiveObject } from "./fold.js";

/** Where a revival happened, for the located rejection F-Reason wants. */
export interface RevivalSite {
  readonly line: number;
  readonly column: number;
  /** The declarator or call this tree came from, for the message. */
  readonly what: string;
}

const DOTTED = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;

type Env = Record<string, unknown>;

/**
 * @param bindings the folding file's resolved names, `externals`. A host-owned
 *   import puts the real value here (F-Import, F-Host-Trust arm 1), which is
 *   what makes revival possible at all.
 * @param inHostArgs true inside an intrinsic's or helper's arguments, where
 *   F-Val-Position rejects an `{__attrRef}` instead of passing it through.
 */
export function revive(
  value: unknown,
  bindings: ReadonlyMap<string, unknown>,
  site: RevivalSite,
  inHostArgs = false,
): unknown {
  if (value === null || typeof value !== "object") return value;
  // F-Val-Live: a live object passes through unchanged, never rebuilt.
  if (isLiveObject(value)) return value;
  // A structure with no envelope anywhere inside is already final, and is
  // returned AS IS rather than rebuilt. F-Memo requires every reference to
  // X(g) to be the same object; a rebuilt copy would make F-Capture record an
  // edge to a copy and the judgment vacuous.
  if (Array.isArray(value)) {
    const next = value.map((v) => revive(v, bindings, site, inHostArgs));
    return next.every((v, i) => v === value[i]) ? value : next;
  }
  if (!isEnvelope(value)) {
    const out: Env = {};
    let changed = false;
    for (const [k, v] of Object.entries(value)) {
      out[k] = revive(v, bindings, site, inHostArgs);
      if (out[k] !== v) changed = true;
    }
    return changed ? out : value;
  }
  return reviveEnvelope(value as Env, bindings, site, inHostArgs);
}

function fail(site: RevivalSite, message: string): never {
  throw new FoldRejection("F-Val-Fate", site.line, site.column, `${site.what}: ${message}`);
}

function resolve(name: string, bindings: ReadonlyMap<string, unknown>, site: RevivalSite): unknown {
  if (!bindings.has(name)) fail(site, `revival cannot resolve ${name}; the folding file does not import it from the host`);
  return bindings.get(name);
}

function callable(name: string, bindings: ReadonlyMap<string, unknown>, site: RevivalSite): (...a: unknown[]) => unknown {
  const v = resolve(name, bindings, site);
  if (typeof v !== "function") fail(site, `${name} resolves to ${typeof v}, which revival cannot invoke`);
  return v as (...a: unknown[]) => unknown;
}

function reviveEnvelope(e: Env, bindings: ReadonlyMap<string, unknown>, site: RevivalSite, inHostArgs: boolean): unknown {
  // `__attrRef` is the one envelope that survives, except inside host arguments.
  if ("__attrRef" in e) {
    if (inHostArgs) {
      const { entity, attribute } = e.__attrRef as { entity: string; attribute: string };
      fail(site, `an attribute reference (${entity}.${attribute}) inside a host call's arguments is rejected, not revived (F-Val-Position)`);
    }
    return e;
  }
  const args = (a: unknown) => (a as unknown[]).map((x) => revive(x, bindings, site, true));

  if ("__resource" in e) {
    const name = e.__resource as string;
    const C = callable(name, bindings, site) as unknown as new (...a: unknown[]) => unknown;
    // F-Val-Arity: spread `args` when present, otherwise props and optional attributes.
    if (Array.isArray(e.args)) return new C(...(e.args as unknown[]).map((x) => revive(x, bindings, site, false)));
    const props = revive(e.props, bindings, site, false);
    return "attributes" in e ? new C(props, revive(e.attributes, bindings, site, false)) : new C(props);
  }
  if ("__intrinsic" in e) {
    const fn = callable(e.__intrinsic as string, bindings, site);
    // The tag form keeps its cooked strings; the call form is a plain call.
    if (Array.isArray(e.strings)) return fn(e.strings as unknown as string[], ...args(e.values));
    return fn(...args(e.args));
  }
  if ("__helper" in e) return callable(e.__helper as string, bindings, site)(...args(e.args));
  if ("__symbol" in e) {
    const text = e.__symbol as string;
    if (!DOTTED.test(text)) fail(site, `a symbolic reference revives only through a simple dotted chain, and "${text}" is not one`);
    const [root, ...rest] = text.split(".");
    let current = resolve(root, bindings, site);
    for (const step of rest) {
      if (current === null || current === undefined) fail(site, `revival of "${text}" read "${step}" on ${String(current)}`);
      current = (current as Env)[step];
    }
    return current;
  }
  // __compositeStep
  fail(site, "a composite step envelope needs a composite factory form, which this implementation does not have");
}
