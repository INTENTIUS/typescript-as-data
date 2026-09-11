/**
 * The authoring-helper allowlist and the owned-specifier prefixes, the two
 * host-installed lists F-Host-Interface items 4 and 5 name. Written from
 * hosts.md (#50); the reference ships neither list.
 */
export interface FoldableHelperDef {
  readonly name: string;
  /** Where the host defines it, for the audit trail F-Host-Admission asks for. */
  readonly module: string;
  /** Why it satisfies F-Host-Admission: pure, deterministic, same at fold time as at run time. */
  readonly note: string;
}

const HELPERS: FoldableHelperDef[] = [];
const HELPER_NAMES = new Set<string>();
export function registerHelpers(defs: readonly FoldableHelperDef[]): void {
  HELPERS.splice(0, HELPERS.length, ...defs);
  HELPER_NAMES.clear();
  for (const d of defs) HELPER_NAMES.add(d.name);
}
export const FOLDABLE_AUTHORING_HELPERS: readonly FoldableHelperDef[] = HELPERS;

/**
 * The name half of F-Eval-CallHelper. Provenance, that the name is bound by
 * an import from the host, is revival's question (F-Div-Provenance).
 */
export function isFoldableHelperName(name: string): boolean {
  return HELPER_NAMES.has(name);
}

const HOST_PACKAGE_SPECIFIERS: string[] = [];
export function registerHostSpecifiers(prefixes: readonly string[]): void {
  HOST_PACKAGE_SPECIFIERS.splice(0, HOST_PACKAGE_SPECIFIERS.length, ...prefixes);
}
/** F-Host-Trust arm 1, the text-matched half. */
export function isHostOwnedSpecifier(specifier: string): boolean {
  return HOST_PACKAGE_SPECIFIERS.some((p) => specifier === p || specifier.startsWith(p.endsWith("-") ? p : `${p}/`));
}
