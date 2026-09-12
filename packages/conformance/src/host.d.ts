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
    readonly helpers: readonly {
        name: string;
        module: string;
        note: string;
    }[];
    /** Specifier, then export name, to the real value. Revival calls these (F-Val-Fate). */
    readonly values: ReadonlyMap<string, ReadonlyMap<string, unknown>>;
}
export declare const HOSTS: ReadonlyMap<string, ConformanceHost>;
export declare function requireHost(name: string): ConformanceHost;
//# sourceMappingURL=host.d.ts.map