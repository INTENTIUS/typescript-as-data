/**
 * The rules contract (rules.md, #101) in this implementation: the host names a
 * rule by id and this file carries its code, which is what F-Rule-Supply says
 * a rule is. A rule sees one of two inputs and nothing else (F-Rule-Input):
 * the folded namespace, every file that finally folded with its exports as
 * final values, or the artifact, which here is the JSON serialization of
 * that namespace, parsed once. Which input it reads is its phase
 * (F-Rule-Phase). A rule is a function of that input (F-Rule-Pure): nothing
 * in this file reads a clock, the environment or the network.
 *
 * A file that runs has no folded namespace, so a rule does not see it; that
 * is the case chant answers by executing the file, which this package does
 * not do (CAVEATS.md).
 */
import { isFoldableFunction } from "./fold.js";
import type { Host } from "./host.js";
import type { ProjectResult } from "./project.js";

export type Severity = "error" | "warning" | "info";
export interface Finding { rule: string; severity: Severity; subject: string; message: string; file?: string }

/** The folded namespace: file, then export, to its final value. */
export type Namespace = ReadonlyMap<string, ReadonlyMap<string, unknown>>;
/** The artifact, parsed: the same shape as the namespace, after JSON. */
export type Artifact = Record<string, Record<string, unknown>>;

interface Rule {
  readonly phase: "pre" | "post";
  readonly pre?: (ns: Namespace, severity: Severity) => Finding[];
  readonly post?: (doc: Artifact, severity: Severity) => Finding[];
}

const isEntity = (v: unknown, type: string): v is { props?: Record<string, unknown> } =>
  typeof v === "object" && v !== null && (v as { entityType?: unknown }).entityType === type;

/** The rules this implementation carries, by the id a host names them by. */
export const RULES: ReadonlyMap<string, Rule> = new Map<string, Rule>([
  ["SHAPES001", {
    phase: "pre",
    pre(ns, severity) {
      const out: Finding[] = [];
      for (const [file, exports] of ns) for (const [name, value] of exports) {
        if (isEntity(value, "Bucket") && !(value.props && "BucketName" in value.props)) {
          out.push({ rule: "SHAPES001", severity, subject: name, file, message: `Bucket ${name} declares no BucketName` });
        }
      }
      return out;
    },
  }],
  ["SHAPES002", {
    phase: "post",
    post(doc, severity) {
      const any = Object.values(doc).some((exports) => Object.values(exports).some((v) => isEntity(v, "Bucket")));
      return any ? [] : [{ rule: "SHAPES002", severity, subject: "missing: Bucket", message: "the artifact declares no Bucket" }];
    },
  }],
]);

/** Every rule the host names is one this implementation carries; otherwise the host's rules cannot be run here. */
export function canRun(host: Host): boolean {
  return (host.rules ?? []).every((r) => RULES.get(r.id)?.phase === r.phase);
}

/** A callable is never a value (F-Val-Callable) and never reaches a serializer (F-Val-Serializable), so an exported function is not in the namespace a rule sees. */
export function namespaceOf(result: ProjectResult): Namespace {
  const ns = new Map<string, ReadonlyMap<string, unknown>>();
  for (const [file, v] of result.verdicts) {
    if (v.kind !== "fold") continue;
    ns.set(file, new Map([...v.exports].filter(([, x]) => !isFoldableFunction(x) && typeof x !== "function")));
  }
  return ns;
}

/** The serializer's output, then parsed once (L11.2, L11.3): a rule of the post phase reads this and nothing else. */
export function artifactOf(ns: Namespace): { text: string; doc: Artifact } {
  const text = JSON.stringify(Object.fromEntries([...ns].map(([f, e]) => [f, Object.fromEntries(e)])));
  return { text, doc: JSON.parse(text) as Artifact };
}

export function runRules(result: ProjectResult, host: Host, phase: "pre" | "post"): Finding[] {
  const ns = namespaceOf(result);
  const out: Finding[] = [];
  for (const r of host.rules ?? []) {
    if (r.phase !== phase) continue;
    const rule = RULES.get(r.id);
    if (!rule || rule.phase !== r.phase) throw new Error(`rule ${r.id} (${r.phase}) is not one this implementation carries`);
    // The configured severity is the host's declaration (L11.6); the rule's own is what it would say unconfigured.
    if (phase === "pre") out.push(...rule.pre!(ns, r.severity));
    else out.push(...rule.post!(artifactOf(ns).doc, r.severity));
  }
  return out;
}
