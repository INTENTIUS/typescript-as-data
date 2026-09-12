// The host interface the ported expression layer needs (#20, F-Host-Interface).
// IntrinsicDef and the three predicates are copied from chant's lexicon.ts at 1b9f5133;
// registerHelpers / registerHostSpecifiers live in foldable-helpers.ts.
export interface IntrinsicDef {
  readonly name: string;
  readonly description?: string;
  readonly outputKey?: string;
  /** Required: authored as a tagged template. Mutually exclusive with the two flags below (F-Host-Registry). */
  readonly isTag: boolean;
  /** Opt-in, per intrinsic: the plain-call form folds to an envelope. */
  readonly foldsAsCall?: boolean;
  /** Opt-in, per intrinsic: the plain-call form is evaluated at fold time. */
  readonly foldsEagerly?: boolean;
}
export function intrinsicTagFolds(def: { isTag?: boolean }): boolean { return def.isTag === true; }
export function intrinsicCallFolds(def: { isTag?: boolean; foldsAsCall?: boolean }): boolean { return def.isTag !== true && def.foldsAsCall === true; }
export function intrinsicCallFoldsEagerly(def: { isTag?: boolean; foldsEagerly?: boolean }): boolean { return def.isTag !== true && def.foldsEagerly === true; }

/**
 * What a host-owned specifier really exports: specifier, then export name, to
 * the live value. F-Host-Interface item 1's entity constructors live here, as
 * do the intrinsic and helper functions items 3 and 4 name, because revival
 * has to *call* them (F-Val-Fate) and a description cannot be called.
 */
export type HostValues = ReadonlyMap<string, ReadonlyMap<string, unknown>>;

export interface Host {
  readonly intrinsics: readonly IntrinsicDef[];
  readonly helpers: readonly { name: string; module: string; note: string }[];
  readonly ownedSpecifierPrefixes: readonly string[];
  readonly values: HostValues;
}
export const EMPTY_HOST: Host = { intrinsics: [], helpers: [], ownedSpecifierPrefixes: [], values: new Map() };
