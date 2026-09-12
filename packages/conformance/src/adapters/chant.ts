/**
 * #11 — chant as an implementation under test, through its PUBLIC entry only:
 * `fold`, `collectConsts`, `FoldError`, and — since chant-v0.64.0 (chant#2362)
 * — `findSubsetViolation` for the shape half. If an older chant is pinned the
 * adapter reports shape "unavailable" rather than guessing.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as ts from "typescript";
import * as chant from "@intentius/chant";
import type { ConformanceAdapter, ProjectResult, ProjectVerdict } from "../adapter";

function exportInitializer(sf: ts.SourceFile, name: string): ts.Expression | undefined {
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return d.initializer;
  }
  return undefined;
}
const parse = (src: string) => ts.createSourceFile("fixture.ts", src, ts.ScriptTarget.Latest, true);
const shapeFn = (chant as unknown as { findSubsetViolation?: (n: ts.Node) => { node: ts.Node; ruleId: string; message: string } | undefined }).findSubsetViolation;

/**
 * The whole-build entry, chant-v0.71.0+ (chant#2408). Absent on an older pin,
 * in which case the project fixtures report "unavailable" rather than passing
 * vacuously.
 */
type ChantVerdict = {
  verdict: "fold" | "run";
  tentative: "fold" | "run";
  reason?: string;
  taintedBy?: { from: string; kind: "importer" | "capture" };
  exports?: ReadonlyMap<string, unknown>;
};
const projectFn = (
  chant as unknown as {
    foldProject?: (files: readonly string[], intrinsics?: readonly unknown[]) => Promise<Map<string, ChantVerdict>>;
  }
).foldProject;

/** chant resolves modules from disk, so a fixture's sources are written out and the paths handed over. */
async function foldOnDisk(files: Map<string, string>): Promise<ProjectResult> {
  const root = mkdtempSync(join(tmpdir(), "tsad-conformance-"));
  try {
    const paths: string[] = [];
    for (const [rel, source] of files) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, source, "utf8");
      paths.push(abs);
    }
    const verdicts = await projectFn!(paths, []);
    const out: ProjectResult = { verdicts: {}, tentative: {}, taintedBy: {} };
    const relOf = (abs: string) => abs.slice(root.length + 1).split(/[\\/]/).join("/");
    for (const [abs, v] of verdicts) {
      const key = relOf(abs);
      out.verdicts[key] =
        v.verdict === "fold"
          ? ({ kind: "fold", exports: Object.fromEntries(v.exports ?? new Map()) } as ProjectVerdict)
          : ({ kind: "run", reason: v.reason ?? "tainted" } as ProjectVerdict);
      out.tentative![key] = v.tentative;
      if (v.taintedBy) out.taintedBy![key] = relOf(v.taintedBy.from);
    }
    return out;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export const chantAdapter: ConformanceAdapter = {
  name: `chant@${(chant as unknown as { VERSION?: string }).VERSION ?? "0.69.1"}`,
  shape(source, exportName) {
    if (!shapeFn) return "unavailable";
    const sf = parse(source); const init = exportInitializer(sf, exportName);
    if (!init) return { accepted: false, line: 1, column: 1, message: `no export named ${exportName}` };
    const v = shapeFn(init); if (!v) return { accepted: true };
    const { line, character } = sf.getLineAndCharacterOfPosition(v.node.getStart());
    return { accepted: false, rule: v.ruleId, line: line + 1, column: character + 1, message: v.message };
  },
  async foldProject(files, host) {
    if (!projectFn) return "unavailable";
    // A named host's entity classes come from a package chant cannot resolve,
    // and its entry takes an intrinsic registry rather than a whole host, so a
    // host-dependent fixture is not answerable here.
    if (host) return "unavailable";
    return foldOnDisk(files);
  },
  foldExport(source, exportName) {
    const sf = parse(source); const init = exportInitializer(sf, exportName);
    if (!init) return { ok: false, line: 1, column: 1, message: `no export named ${exportName}` };
    try { return { ok: true, value: chant.fold(init, chant.collectConsts(sf), [], undefined) }; }
    catch (e) {
      if (e instanceof chant.FoldError) return { ok: false, rule: e.ruleId, line: e.line, column: e.column, message: e.message };
      throw e;
    }
  },
};
