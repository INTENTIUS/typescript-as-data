import type { ConformanceAdapter, ConformanceHost, ProjectResult } from "@intentius/tsad-conformance";
import { EMPTY_HOST, type Host, type Profile } from "./host.js";
import { shapeOfExport, foldExport } from "./module.js";
import { foldProject } from "./project.js";

/** A named conformance host, in this implementation's own terms. */
function hostOf(h: ConformanceHost | undefined, profile: Profile): Host {
  if (!h) return { ...EMPTY_HOST, profile };
  return {
    profile,
    intrinsics: h.intrinsics.map((i) => ({ name: i.name, isTag: i.isTag, foldsAsCall: i.foldsAsCall, foldsEagerly: i.foldsEagerly, outputKey: i.outputKey })),
    helpers: h.helpers,
    ownedSpecifierPrefixes: h.ownedSpecifierPrefixes,
    values: h.values,
  };
}

/** The reference reports spec rule identifiers directly: it is written from the spec. One adapter per profile (F-Profile). */
function adapterFor(profile: Profile): ConformanceAdapter {
  return {
  name: profile === "full" ? "reference" : `reference/${profile}`,
  // Bumped by hand when the rule set this package implements moves; the
  // conformance suite fails when it and spec/VERSION disagree (#18).
  specVersion: "1.2",
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
  };
}

export const referenceAdapter: ConformanceAdapter = adapterFor("full");
/** The same implementation judged in the data-host profile: no runtime, and S-ExportDefault admitted. */
export const referenceDataHostAdapter: ConformanceAdapter = adapterFor("data-host");
