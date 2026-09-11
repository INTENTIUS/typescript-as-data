// Re-port chant's expression layer into packages/reference, re-applying the
// cuts recorded in packages/reference/CUTS.md (#19). Run after a chant release
// that touches fold/: `node scripts/sync-port.mjs <path-to-chant> <sha>`.
// The cuts are textual and asserted: if one no longer matches, the script
// fails rather than producing a port that quietly dropped a cut.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [chantRoot, sha] = process.argv.slice(2);
if (!chantRoot || !sha) { console.error("usage: sync-port.mjs <chant-root> <sha>"); process.exit(2); }
const src = join(chantRoot, "packages/core/src/fold");
const dst = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "reference", "src");
const header = (f) =>
  `// Ported from INTENTIUS/chant packages/core/src/fold/${f} at ${sha} (Apache-2.0).\n` +
  `// Derived, not rewritten (#19). Every chant-specific cut is listed in ../CUTS.md.\n` +
  `// Regenerate with scripts/sync-port.mjs; do not edit by hand.\n\n`;

function cut(text, from, to, label) {
  if (!text.includes(from)) { console.error(`CUT NO LONGER MATCHES: ${label}`); process.exit(1); }
  return text.replace(from, to);
}

let s = readFileSync(join(src, "subset.ts"), "utf8");
s = cut(s, 'import { intrinsicCallFolds, intrinsicCallFoldsEagerly, type IntrinsicDef } from "../lexicon";',
           'import { intrinsicCallFolds, intrinsicCallFoldsEagerly, type IntrinsicDef } from "./host";', "subset.ts lexicon import");
writeFileSync(join(dst, "subset.ts"), header("subset.ts") + s);

let f = readFileSync(join(src, "fold.ts"), "utf8");
f = cut(f, 'import { relative } from "node:path";\n', "", "fold.ts node:path import");
f = cut(f, 'import { intrinsicCallFolds, intrinsicCallFoldsEagerly, intrinsicTagFolds, type IntrinsicDef } from "../lexicon";',
           'import { intrinsicCallFolds, intrinsicCallFoldsEagerly, intrinsicTagFolds, type IntrinsicDef } from "./host";', "fold.ts lexicon import");
f = cut(f, `function fileLabel(file: string): string {\n  const rel = relative(process.cwd(), file);\n  return rel.startsWith("..") ? file : rel;\n}`,
           `function fileLabel(file: string): string {\n  return file; // CUT (#19): chant relativised diagnostics to process.cwd(); presentation, not mechanism.\n}`, "fold.ts fileLabel");
writeFileSync(join(dst, "fold.ts"), header("fold.ts") + f);

let h = readFileSync(join(src, "foldable-helpers.ts"), "utf8");
const i = h.indexOf("export const FOLDABLE_AUTHORING_HELPERS");
const j = h.indexOf("];", i);
if (i < 0 || j < 0) { console.error("CUT NO LONGER MATCHES: helper allowlist"); process.exit(1); }
h = h.slice(0, i) + `/**
 * CUT (#19): chant's registered helpers were a hand-written list here.
 * A host installs its own list; the reference ships none (F-Host-Admission).
 */
const HELPERS: FoldableHelperDef[] = [];
export function registerHelpers(defs: readonly FoldableHelperDef[]): void {
  HELPERS.splice(0, HELPERS.length, ...defs);
  HELPER_NAMES.clear();
  for (const d of defs) HELPER_NAMES.add(d.name);
}
export const FOLDABLE_AUTHORING_HELPERS: readonly FoldableHelperDef[] = HELPERS;` + h.slice(j + 2);
h = cut(h, "const HELPER_NAMES: ReadonlySet<string> = new Set(FOLDABLE_AUTHORING_HELPERS.map((h) => h.name));",
           "const HELPER_NAMES = new Set<string>();", "helper name set");
h = h.replace(/const CHANT_PACKAGE_SPECIFIERS: readonly string\[\] = \[[\s\S]*?\];/,
  "const HOST_PACKAGE_SPECIFIERS: string[] = [];\nexport function registerHostSpecifiers(prefixes: readonly string[]): void { HOST_PACKAGE_SPECIFIERS.splice(0, HOST_PACKAGE_SPECIFIERS.length, ...prefixes); }");
h = cut(h, "export function isChantOwnedSpecifier(specifier: string): boolean {\n  return CHANT_PACKAGE_SPECIFIERS.some(",
           "export function isHostOwnedSpecifier(specifier: string): boolean {\n  return HOST_PACKAGE_SPECIFIERS.some(", "isChantOwnedSpecifier");
writeFileSync(join(dst, "foldable-helpers.ts"), header("foldable-helpers.ts") + h);
console.log(`ported at ${sha}; all cuts applied`);
