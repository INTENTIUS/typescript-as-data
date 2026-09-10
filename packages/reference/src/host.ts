/** F-Host-Interface — what a host supplies. The reference implementation ships an empty host. */
export interface IntrinsicDef {
  readonly name: string;
  readonly isTag: boolean;
  readonly foldsAsCall?: boolean;
  readonly foldsEagerly?: boolean;
}
export interface Host {
  readonly intrinsics: readonly IntrinsicDef[];
  readonly helpers: ReadonlySet<string>;
}
export const EMPTY_HOST: Host = { intrinsics: [], helpers: new Set() };
