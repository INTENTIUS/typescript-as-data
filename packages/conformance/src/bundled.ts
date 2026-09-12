/**
 * Where the published package keeps the fixtures. `spec/fixtures/` is copied
 * in at build time (see `package.json`'s build script), so an implementation
 * that installed this package from npm has the same fixtures the repository
 * gates on, at the version the package declares.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The bundled rule files and `VERSION`, or the repository's own `spec/` when running from source. */
export function bundledSpecDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, "..", "spec"), join(here, "..", "..", "..", "spec")]) {
    if (existsSync(join(candidate, "VERSION"))) return candidate;
  }
  throw new Error("no spec directory: the package was built without one, and this is not the repository");
}

/** The bundled fixtures directory, or the repository's own when running from source. */
export function bundledFixturesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, "..", "fixtures"), join(here, "..", "..", "..", "spec", "fixtures")]) {
    if (existsSync(join(candidate, "UNCOVERED.md"))) return candidate;
  }
  throw new Error("no fixtures directory: the package was built without one, and this is not the repository");
}
