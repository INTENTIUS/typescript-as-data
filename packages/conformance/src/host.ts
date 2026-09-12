/**
 * Named hosts a fixture may ask for (#61). A fixture is data — `.ts` sources
 * and a JSON expectation — and F-Host-Interface item 1 requires real classes
 * that revival can construct, so the classes live here, in code, and a fixture
 * names the host it wants.
 *
 * Neutral by construction: nothing here imports an implementation. An adapter
 * translates a `ConformanceHost` into whatever its own host interface is.
 */

/** An intrinsic registration, F-Host-Registry's shape. */
export interface HostIntrinsic {
  readonly name: string;
  readonly isTag: boolean;
  readonly foldsAsCall?: boolean;
  readonly foldsEagerly?: boolean;
  readonly outputKey?: string;
}

export interface ConformanceHost {
  readonly name: string;
  /** F-Host-Trust arm 1: the specifiers this host owns. */
  readonly ownedSpecifierPrefixes: readonly string[];
  readonly intrinsics: readonly HostIntrinsic[];
  readonly helpers: readonly { name: string; module: string; note: string }[];
  /** Specifier, then export name, to the real value. Revival calls these (F-Val-Fate). */
  readonly values: ReadonlyMap<string, ReadonlyMap<string, unknown>>;
}

const DECLARABLE = Symbol.for("tsad.conformance.declarable");

/** F-Host-Interface item 1's shape: `new (props, attributes?)`, carrying the markers an entity carries. */
class Bucket {
  readonly entityType = "Bucket";
  readonly lexicon = "shapes";
  readonly props: Record<string, unknown>;
  readonly attributes: Record<string, unknown>;
  constructor(props: Record<string, unknown> = {}, attributes: Record<string, unknown> = {}) {
    this.props = props;
    this.attributes = attributes;
    Object.defineProperty(this, DECLARABLE, { value: true, enumerable: false });
  }
}

/** Spread-`args` arity, the other arm of F-Val-Arity. */
class Pair {
  readonly entityType = "Pair";
  readonly lexicon = "shapes";
  constructor(readonly left: unknown, readonly right: unknown) {
    Object.defineProperty(this, DECLARABLE, { value: true, enumerable: false });
  }
}

/** A live object the host owns outright, for the F-CallLeak case: no construction involved. */
const registry = new Map<string, string>([["one", "1"]]);

/** An intrinsic in tag form: revival invokes it as `Name(strings, ...values)`. */
const join = (strings: readonly string[], ...values: unknown[]): string =>
  strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ""), "");

/** An authoring helper: pure, deterministic, the same at fold time as at run time. */
const upper = (s: string): string => s.toUpperCase();

const SHAPES: ConformanceHost = {
  name: "shapes",
  ownedSpecifierPrefixes: ["@tsad/shapes"],
  intrinsics: [{ name: "join", isTag: true }],
  helpers: [{ name: "upper", module: "@tsad/shapes", note: "pure string transform, no environment read" }],
  values: new Map([
    [
      "@tsad/shapes",
      new Map<string, unknown>([
        ["Bucket", Bucket],
        ["Pair", Pair],
        ["join", join],
        ["upper", upper],
        ["registry", registry],
      ]),
    ],
  ]),
};

export const HOSTS: ReadonlyMap<string, ConformanceHost> = new Map([[SHAPES.name, SHAPES]]);

export function requireHost(name: string): ConformanceHost {
  const h = HOSTS.get(name);
  if (!h) throw new Error(`no such conformance host: ${name}. Known: ${[...HOSTS.keys()].join(", ")}`);
  return h;
}
