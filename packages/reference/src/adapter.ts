import type { ConformanceAdapter } from "@intentius/tsad-conformance";
import { shapeOfExport, foldExport } from "./module";

/** The reference reports spec rule identifiers directly: it is written from the spec. */
export const referenceAdapter: ConformanceAdapter = {
  name: "reference",
  shape(source, exportName) {
    const v = shapeOfExport(source, exportName);
    if (v === "no-such-export") return { accepted: false, line: 1, column: 1, message: `no export named ${exportName}` };
    if (!v) return { accepted: true };
    const { line, character } = v.node.getSourceFile().getLineAndCharacterOfPosition(v.node.getStart());
    return { accepted: false, rule: v.rule, line: line + 1, column: character + 1, message: v.message };
  },
  foldExport(source, exportName) { return foldExport(source, exportName); },
};
