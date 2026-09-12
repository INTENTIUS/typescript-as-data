/**
 * A generator (F-Val-Source, #80): from a namespace of values to one module
 * in the subset whose fold, in `data-host`, is that namespace. The forms are
 * the ones F-Val-Source's table names, one per case, and nothing is factored:
 * this is the smallest generator that makes the round trip executable, not a
 * good one. A value with no form here is reported rather than approximated.
 */
import type { Host } from "./host.js";

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export class NoSourceForm extends Error {}

export function generate(namespace: Record<string, unknown>, host: Host): string {
  const imports = new Set<string>();
  const specifier = host.ownedSpecifierPrefixes[0];
  const needs = (name: string) => {
    if (!specifier) throw new NoSourceForm(`${name} needs a host specifier to import from`);
    imports.add(name);
  };
  // An attribute reference names a same-file `const` bound to a `new`
  // (F-Eval-Member step 1), so every entity it may name is one of the
  // exports and is a resource; anything else has no form.
  const entities = new Set(Object.entries(namespace).filter(([, v]) => isEnvelope(v, "__resource")).map(([k]) => k));

  const expr = (v: unknown, interior: boolean): string => {
    if (v === undefined) return "undefined";
    if (v === null || typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
    if (typeof v === "number") return Number.isFinite(v) ? JSON.stringify(v) : String(v);
    if (typeof v !== "object") throw new NoSourceForm(`a ${typeof v} is not a value`);
    if (Array.isArray(v)) return `[${v.map((e) => expr(e, interior)).join(", ")}]`;
    const o = v as Record<string, unknown>;
    if (isEnvelope(o, "__attrRef")) {
      const { entity, attribute } = o.__attrRef as { entity: string; attribute: string };
      if (!entities.has(entity)) throw new NoSourceForm(`attribute reference to ${entity}, which is not a resource in this namespace`);
      return IDENT.test(attribute) ? `${entity}.${attribute}` : `${entity}[${JSON.stringify(attribute)}]`;
    }
    if (isEnvelope(o, "__intrinsic")) {
      const name = o.__intrinsic as string; needs(name);
      if ("strings" in o) {
        const strings = o.strings as string[], values = o.values as unknown[];
        const spans = strings.map((str, i) => escapeSpan(str) + (i < values.length ? "${" + expr(values[i], true) + "}" : "")).join("");
        return name + "`" + spans + "`";
      }
      return `${name}(${(o.args as unknown[]).map((a) => expr(a, true)).join(", ")})`;
    }
    if (isEnvelope(o, "__helper")) throw new NoSourceForm("a helper call has no form in data-host: the profile has no helpers");
    if (isEnvelope(o, "__compositeStep")) throw new NoSourceForm("a composite step has no form here: no composite factory form");
    if (isEnvelope(o, "__resource")) {
      const cls = o.__resource as string; needs(cls);
      if ("args" in o) return `new ${cls}(${(o.args as unknown[]).map((a) => expr(a, false)).join(", ")})`;
      return "attributes" in o ? `new ${cls}(${expr(o.props, false)}, ${expr(o.attributes, false)})` : `new ${cls}(${expr(o.props, false)})`;
    }
    if (isEnvelope(o, "__symbol")) {
      if (!interior) throw new NoSourceForm("a symbol has a form only inside an intrinsic (F-Val-Symbol-Scope)");
      return o.__symbol as string;
    }
    if (Object.getPrototypeOf(o) !== Object.prototype && Object.getPrototypeOf(o) !== null) throw new NoSourceForm("a live instance has no source form of its own");
    return `{ ${Object.entries(o).map(([k, e]) => `${IDENT.test(k) ? k : JSON.stringify(k)}: ${expr(e, interior)}`).join(", ")} }`;
  };

  const body = Object.entries(namespace).map(([name, v]) => `export const ${name} = ${expr(v, false)};`);
  const head = imports.size ? [`import { ${[...imports].sort().join(", ")} } from ${JSON.stringify(specifier)};`, ""] : [];
  return [...head, ...body, ""].join("\n");
}

const ENVELOPES = ["__attrRef", "__intrinsic", "__helper", "__resource", "__compositeStep", "__symbol"];
function isEnvelope(v: unknown, key: string): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v) && key in v && ENVELOPES.some((k) => k in (v as object));
}
const escapeSpan = (s: string) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
