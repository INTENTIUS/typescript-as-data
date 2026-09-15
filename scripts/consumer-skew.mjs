#!/usr/bin/env node
// What specification version a consumer of this repository is actually running
// (#192), and how far behind this repository's own `spec/VERSION` that is.
//
//   node scripts/consumer-skew.mjs <consumer-dir> [out.json]
//
// The site presents forgejo-warden as the demonstration that this
// specification is usable by a platform that is neither this repository nor
// chant. It was running six minors behind the specification it demonstrates
// and nothing noticed, because nothing on this side read its declaration.
//
// Nothing had to be added to warden for this to work. `spec/README.md` says an
// implementation declares the version it implements, and the evaluator warden
// installs already does: `@intentius/tsad-reference` exports an adapter
// carrying `specVersion`. What was missing was a reader. So this imports the
// consumer's OWN installed copy rather than this checkout's, which is the
// whole point — the question is what the consumer runs, not what we ship.
//
// Reports rather than fails. The version a consumer pins is that repository's
// decision and its lockfile is not ours to gate on; #183 declined to print a
// version on warden's page for the same reason. What this produces is the
// number that page could not state, dated and committed, so the skew is a fact
// on the site instead of something a reader would have to go and check.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dir = resolve(process.argv[2] ?? ".");
const out = process.argv[3];

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const spec = readFileSync(join(root, "spec", "VERSION"), "utf8").trim();

/** The evaluator the consumer installed, and the version it declares. */
async function declaration(consumerDir) {
  const pkgDir = join(consumerDir, "node_modules", "@intentius", "tsad-reference");
  let installed = null;
  try {
    installed = read(join(pkgDir, "package.json")).version;
  } catch {
    return { evaluator: null, declares: "uninstalled", why: "no @intentius/tsad-reference under the consumer's node_modules" };
  }
  try {
    const mod = await import(pathToFileURL(join(pkgDir, "dist", "index.js")).href);
    const declared = mod.referenceAdapter?.specVersion;
    if (typeof declared !== "string") {
      return { evaluator: installed, declares: "undeclared", why: "the installed adapter carries no specVersion" };
    }
    return { evaluator: installed, declares: declared };
  } catch (err) {
    return { evaluator: installed, declares: "undeclared", why: `could not load the installed adapter: ${err.message}` };
  }
}

/**
 * How far apart two `major.minor` versions are, in the terms the versioning
 * policy uses. A minor lag is ordinary — an implementation of 1.0 implements
 * 1.1's full profile unchanged. A major lag means source that folded under the
 * consumer's version may not under ours, which is the one worth saying out loud.
 */
function skewOf(declares, current) {
  if (!/^\d+\.\d+$/.test(declares)) return { kind: declares, majors: null, minors: null };
  const [dMaj, dMin] = declares.split(".").map(Number);
  const [cMaj, cMin] = current.split(".").map(Number);
  if (dMaj === cMaj && dMin === cMin) return { kind: "current", majors: 0, minors: 0 };
  if (dMaj === cMaj) return { kind: dMin < cMin ? "minor-behind" : "ahead", majors: 0, minors: cMin - dMin };
  return { kind: dMaj < cMaj ? "major-behind" : "ahead", majors: cMaj - dMaj, minors: null };
}

const name = (() => {
  try {
    return read(join(dir, "package.json")).name;
  } catch {
    return dir.split("/").pop();
  }
})();

const d = await declaration(dir);
const skew = skewOf(d.declares, spec);
const record = {
  _comment:
    "Written by scripts/consumer-skew.mjs from the weekly demo workflow (#192): what specification version the consumer's own installed evaluator declares, against this repository's spec/VERSION. Reported, never gated — the version a consumer pins is that repository's decision.",
  date: new Date().toISOString().slice(0, 10),
  specVersion: spec,
  consumer: { name, evaluator: d.evaluator, declares: d.declares, ...(d.why ? { why: d.why } : {}) },
  skew,
};

const line =
  skew.kind === "current"
    ? `${name} declares spec ${d.declares}, which is current`
    : skew.kind === "major-behind"
      ? `${name} declares spec ${d.declares} against ${spec}: ${skew.majors} major behind`
      : skew.kind === "minor-behind"
        ? `${name} declares spec ${d.declares} against ${spec}: ${skew.minors} minor behind`
        : `${name} is ${skew.kind}${d.why ? ` (${d.why})` : ""}`;
console.log(line);

if (out) {
  writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
  console.log(`wrote ${out}`);
}
