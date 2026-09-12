import type { ConformanceAdapter, ConformanceHost, ProjectResult } from "@intentius/tsad-conformance";
import { EMPTY_HOST, type Host, type Profile } from "./host.js";
import { shapeOfExport, foldExport } from "./module.js";
import { foldProject } from "./project.js";
import { canRun, runRules } from "./rules.js";

/**
 * A named conformance host, in this implementation's own terms. In
 * `data-host` the host is a description and not code (F-Profile-DataHost,
 * F-Host-Interface): the intrinsic registry and the trust set are kept, and
 * the helpers, the classes and the live values, items 1, 2, 4 and 6, are
 * absent.
 */
function hostOf(h: ConformanceHost | undefined, profile: Profile): Host {
  if (!h) return { ...EMPTY_HOST, profile };
  const data = profile === "data-host";
  return {
    profile,
    intrinsics: h.intrinsics.map((i) => ({ name: i.name, isTag: i.isTag, foldsAsCall: i.foldsAsCall, foldsEagerly: i.foldsEagerly, outputKey: i.outputKey })),
    helpers: data ? [] : h.helpers,
    ownedSpecifierPrefixes: h.ownedSpecifierPrefixes,
    values: data ? new Map() : h.values,
    rules: h.rules,
  };
}

/** The reference reports spec rule identifiers directly: it is written from the spec. One adapter per profile (F-Profile). */
function adapterFor(profile: Profile): ConformanceAdapter {
  return {
  name: profile === "full" ? "reference" : `reference/${profile}`,
  // Bumped by hand when the rule set this package implements moves; the
  // conformance suite fails when it and spec/VERSION disagree (#18).
  specVersion: "1.4",
  shape(source, exportName) {
    const v = shapeOfExport(source, exportName, { ...EMPTY_HOST, profile });
    if (v === "no-such-export") return { accepted: false, line: 1, column: 1, message: `no export named ${exportName}` };
    if (!v) return { accepted: true };
    const { line, character } = v.node.getSourceFile().getLineAndCharacterOfPosition(v.node.getStart());
    return { accepted: false, rule: v.rule, line: line + 1, column: character + 1, message: v.message };
  },
  foldExport(source, exportName) { return foldExport(source, exportName, { ...EMPTY_HOST, profile }); },
  foldProject(files, host) {
    const r = foldProject(files, hostOf(host, profile));
    const out: ProjectResult = { verdicts: {}, tentative: {}, taintedBy: {} };
    for (const [path, v] of r.verdicts) {
      out.verdicts[path] = v.kind === "fold" ? { kind: "fold", exports: Object.fromEntries(v.exports) } : { kind: "run", rule: v.rule, reason: v.reason };
    }
    for (const [path, v] of r.tentative) out.tentative![path] = v.kind;
    for (const [path, from] of r.taintSource) out.taintedBy![path] = from;
    return out;
  },
  rules(files, host, phase) {
    const h = hostOf(host, profile);
    if (!canRun(h)) return "unavailable";
    return runRules(foldProject(files, h), h, phase);
  },
  };
}

export const referenceAdapter: ConformanceAdapter = adapterFor("full");
/** The same implementation judged in the data-host profile: no runtime, and S-ExportDefault admitted. */
export const referenceDataHostAdapter: ConformanceAdapter = adapterFor("data-host");
