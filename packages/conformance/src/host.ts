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

/**
 * A rule the host supplies (F-Rule-Supply), by identifier. The rule's code is
 * the implementation's; what the harness carries is the id, the phase, the
 * rule's own severity (L11.6) and what it checks, in words.
 */
export interface HostRule {
  readonly id: string;
  readonly phase: "pre" | "post";
  readonly severity: "error" | "warning" | "info";
  readonly description: string;
}

export interface ConformanceHost {
  readonly name: string;
  /** F-Host-Trust arm 1: the specifiers this host owns. */
  readonly ownedSpecifierPrefixes: readonly string[];
  readonly intrinsics: readonly HostIntrinsic[];
  readonly helpers: readonly { name: string; module: string; note: string }[];
  /** Specifier, then export name, to the real value. Revival calls these (F-Val-Fate). */
  readonly values: ReadonlyMap<string, ReadonlyMap<string, unknown>>;
  /** F-Host-Interface item 7: the rules this host supplies, if any. */
  readonly rules?: readonly HostRule[];
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

/** An intrinsic in call form (F-Host-Registry `foldsAsCall`): revival invokes it with the folded arguments. */
const ref = (name: string): { Ref: string } => ({ Ref: name });

/** An eager intrinsic (`foldsEagerly`): evaluated at fold time, and F-Host-Admission's third clause holds because it is a pure function of its arguments. */
const count = (items: readonly unknown[]): number => items.length;

/** A plain-data export (F-Host-DataExports): folds as a value through a named import. */
const SIZES = { small: 1, large: 3 } as const;

const SHAPES: ConformanceHost = {
  name: "shapes",
  ownedSpecifierPrefixes: ["@tsad/shapes"],
  intrinsics: [
    { name: "join", isTag: true },
    { name: "ref", isTag: false, foldsAsCall: true },
    { name: "count", isTag: false, foldsEagerly: true },
  ],
  helpers: [{ name: "upper", module: "@tsad/shapes", note: "pure string transform, no environment read" }],
  // Two rules, one per phase (F-Rule-Phase). The pre-synthesis one reads
  // the folded namespace and names the export it concerns; the
  // post-synthesis one reads the artifact and, finding nothing to attach
  // to, reports the missing-resource form (F-Rule-Finding, L11.5).
  rules: [
    { id: "SHAPES001", phase: "pre", severity: "error", description: "every Bucket declares a BucketName; the subject is the export that does not" },
    { id: "SHAPES002", phase: "post", severity: "warning", description: "the artifact declares at least one Bucket; otherwise the subject is `missing: Bucket`" },
  ],
  values: new Map([
    [
      "@tsad/shapes",
      new Map<string, unknown>([
        ["Bucket", Bucket],
        ["Pair", Pair],
        ["join", join],
        ["upper", upper],
        ["ref", ref],
        ["count", count],
        ["SIZES", SIZES],
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
