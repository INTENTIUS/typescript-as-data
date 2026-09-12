/**
 * Named hosts a fixture may ask for (#61). A fixture is data — `.ts` sources
 * and a JSON expectation — and F-Host-Interface item 1 requires real classes
 * that revival can construct, so the classes live here, in code, and a fixture
 * names the host it wants.
 *
 * Neutral by construction: nothing here imports an implementation. An adapter
 * translates a `ConformanceHost` into whatever its own host interface is.
 */
const DECLARABLE = Symbol.for("tsad.conformance.declarable");
/** F-Host-Interface item 1's shape: `new (props, attributes?)`, carrying the markers an entity carries. */
class Bucket {
    entityType = "Bucket";
    lexicon = "shapes";
    props;
    attributes;
    constructor(props = {}, attributes = {}) {
        this.props = props;
        this.attributes = attributes;
        Object.defineProperty(this, DECLARABLE, { value: true, enumerable: false });
    }
}
/** Spread-`args` arity, the other arm of F-Val-Arity. */
class Pair {
    left;
    right;
    entityType = "Pair";
    lexicon = "shapes";
    constructor(left, right) {
        this.left = left;
        this.right = right;
        Object.defineProperty(this, DECLARABLE, { value: true, enumerable: false });
    }
}
/** A live object the host owns outright, for the F-CallLeak case: no construction involved. */
const registry = new Map([["one", "1"]]);
/** An intrinsic in tag form: revival invokes it as `Name(strings, ...values)`. */
const join = (strings, ...values) => strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ""), "");
/** An authoring helper: pure, deterministic, the same at fold time as at run time. */
const upper = (s) => s.toUpperCase();
/** An intrinsic in call form (F-Host-Registry `foldsAsCall`): revival invokes it with the folded arguments. */
const ref = (name) => ({ Ref: name });
/** An eager intrinsic (`foldsEagerly`): evaluated at fold time, and F-Host-Admission's third clause holds because it is a pure function of its arguments. */
const count = (items) => items.length;
/** A plain-data export (F-Host-DataExports): folds as a value through a named import. */
const SIZES = { small: 1, large: 3 };
const SHAPES = {
    name: "shapes",
    ownedSpecifierPrefixes: ["@tsad/shapes"],
    intrinsics: [
        { name: "join", isTag: true },
        { name: "ref", isTag: false, foldsAsCall: true },
        { name: "count", isTag: false, foldsEagerly: true },
    ],
    helpers: [{ name: "upper", module: "@tsad/shapes", note: "pure string transform, no environment read" }],
    values: new Map([
        [
            "@tsad/shapes",
            new Map([
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
export const HOSTS = new Map([[SHAPES.name, SHAPES]]);
export function requireHost(name) {
    const h = HOSTS.get(name);
    if (!h)
        throw new Error(`no such conformance host: ${name}. Known: ${[...HOSTS.keys()].join(", ")}`);
    return h;
}
//# sourceMappingURL=host.js.map