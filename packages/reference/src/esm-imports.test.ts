/**
 * Every relative import in a published package carries `.js`.
 *
 * Both packages are `"type": "module"`, so Node resolves a relative specifier
 * literally and `import { record } from "./trace"` is a runtime failure in the
 * built output. Nothing else catches it: vitest resolves extensionless
 * specifiers, `tsc` emits the specifier unchanged rather than repairing it,
 * and the docs build only type-checks. The first thing to actually load
 * `dist/index.js` was a script written for something else entirely (#192),
 * three commits after the bad import shipped to main.
 *
 * So the check is static and runs with the rest of the suite, no build needed.
 */
import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKAGES = ["reference", "conformance"];

/**
 * What each package's `tsconfig.build.json` excludes, so the gate reads
 * exactly the files that become `dist/`. A test's specifier never ships, and
 * conformance's adapters and corpus are excluded from its build because they
 * import implementations.
 */
const NOT_BUILT = [/\.test\.ts$/, /\.d\.ts$/, /[/\\]adapters[/\\]/, /[/\\]corpus\.ts$/];

/** Every `.ts` under a directory that the package's build actually emits. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return sources(p);
    if (!p.endsWith(".ts") || NOT_BUILT.some((re) => re.test(p))) return [];
    return [p];
  });
}

/**
 * A module-level `import`/`export ... from "./x"` with no extension.
 *
 * Anchored to the start of a line so a specifier inside a fixture's source
 * text or a doc comment is not mistaken for one of this file's own imports —
 * `project.ts` embeds TypeScript in string literals and would otherwise
 * report its fixtures.
 */
const RELATIVE = /^(?:import|export)\b[^\n]*?\bfrom\s+"(\.\.?\/[^"]*)"/;

describe("nothing compiled sits beside the sources", () => {
  // `.gitignore` already calls these a mistake and stops them being committed.
  // It cannot stop them shadowing: the sources import each other as `./x.js`,
  // so a stale `x.js` emitted next to `x.ts` is what the suite loads, and the
  // tests then pass against code that is no longer in the repository.
  //
  // That is not hypothetical. 52 of them sat in `packages/reference/src` while
  // #217 was being written, and three cross-implementation disagreements
  // "survived" a fix that had already been made — the fix was in the `.ts` and
  // the suite was reading the `.js` (#217).
  for (const pkg of PACKAGES) {
    test(`${pkg}: no emitted artifacts under src`, () => {
      const emitted = readdirSync(join(ROOT, pkg, "src"), { recursive: true, encoding: "utf8" })
        .filter((f) => /\.(js|js\.map|d\.ts|d\.ts\.map)$/.test(f))
        .sort();
      expect(emitted, `delete these: a build emits to dist/, and beside the sources they shadow the .ts`).toEqual([]);
    });
  }
});

describe("published packages resolve as ESM", () => {
  for (const pkg of PACKAGES) {
    test(`${pkg}: every relative import carries its extension`, () => {
      const offences: string[] = [];
      for (const file of sources(join(ROOT, pkg, "src"))) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((text, i) => {
          const m = RELATIVE.exec(text);
          if (!m || /\.(js|json|css)$/.test(m[1])) return;
          offences.push(`${file.slice(ROOT.length + 1)}:${i + 1} imports "${m[1]}" with no extension`);
        });
      }
      expect(offences).toEqual([]);
    });
  }
});
