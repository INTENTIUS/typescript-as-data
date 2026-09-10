import type { ConformanceAdapter } from "@intentius/tsad-conformance";
import { shapeOfExport, foldExport } from "./module";
export const referenceAdapter: ConformanceAdapter = {
  name: "reference",
  shape(source, exportName) {
    const s = shapeOfExport(source, exportName);
    if (s === "no-such-export") return { accepted: false, line: 1, column: 1, message: `no export named ${exportName}` };
    if (!s) return { accepted: true };
    const { line, character } = s.node.getSourceFile().getLineAndCharacterOfPosition(s.node.getStart());
    return { accepted: false, rule: s.rule, line: line + 1, column: character + 1, message: s.message };
  },
  foldExport(source, exportName) { return foldExport(source, exportName); },
};
