import type { ConformanceAdapter } from "@intentius/tsad-conformance";
import { shapeOfExport, foldExport } from "./module";

/**
 * #20 decision: the ported code carries chant's lint ids on rejections
 * ("EVL001", "EVL003"). The specification's identifiers are the S- and F- rules,
 * so the adapter translates at the boundary instead of editing the port.
 */
const RULE_ID: Record<string, string> = { EVL001: "S-Reject", EVL003: "S-Index" };
const toSpecRule = (id: string | undefined) => (id ? (RULE_ID[id] ?? id) : undefined);

export const referenceAdapter: ConformanceAdapter = {
  name: "reference",
  shape(source, exportName) {
    const s = shapeOfExport(source, exportName);
    if (s === "no-such-export") return { accepted: false, line: 1, column: 1, message: `no export named ${exportName}` };
    if (!s) return { accepted: true };
    const { line, character } = s.node.getSourceFile().getLineAndCharacterOfPosition(s.node.getStart());
    return { accepted: false, rule: toSpecRule(s.ruleId), line: line + 1, column: character + 1, message: s.message };
  },
  foldExport(source, exportName) {
    const r = foldExport(source, exportName);
    return r.ok ? r : { ...r, rule: toSpecRule(r.rule) ?? r.rule };
  },
};
