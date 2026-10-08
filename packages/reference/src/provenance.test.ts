/**
 * F-Obs-Provenance (spec 2.2) in the reference: one origin per emitted path,
 * of four kinds, innermost writer first, and `unknown` never reported as
 * `direct`.
 */
import { describe, expect, test } from "vitest";
import { EMPTY_HOST, foldProject, type ExportProvenance, type FoldFieldOrigin } from "./index";

const DATA = { ...EMPTY_HOST, profile: "data-host" as const };

function provenanceOf(files: Record<string, string>, file: string): ExportProvenance {
  const r = foldProject(new Map(Object.entries(files)), DATA);
  const v = r.verdicts.get(file);
  if (v?.kind !== "fold") throw new Error(`${file} did not fold: ${JSON.stringify(v)}`);
  return Object.assign({}, ...v.provenance.values());
}

/** The comparable part of an origin: kind, composite and parameters. */
const brief = (o: FoldFieldOrigin | undefined) =>
  o === undefined ? undefined
  : o.kind === "composite-parameter" ? `${o.kind} ${o.composite} [${o.parameters.join(", ")}]`
  : o.kind === "composite-literal" ? `${o.kind} ${o.composite}`
  : o.kind === "unknown" ? `unknown ${o.reason}`
  : "direct";

const PRESETS = `export function repoPreset(opts: { name: string; private?: boolean; topics?: string[] }) {
  const visibility = opts.private ? "private" : "public";
  return { name: opts.name, visibility, settings: { wiki: false, topics: opts.topics ?? [] }, label: \`repo-\${opts.name}\` };
}
`;

describe("F-Obs-Provenance in the reference", () => {
  test("the four kinds, from a preset function and the export around it", () => {
    const p = provenanceOf({
      "presets.ts": PRESETS,
      "repos.ts": `import { repoPreset } from "./presets";
export const api = repoPreset({ name: "api", private: true, topics: ["go"] });
export const owner = { team: "ops", tag: "x".toUpperCase() };
`,
    }, "repos.ts");
    expect(Object.fromEntries(Object.entries(p).map(([k, o]) => [k, brief(o)]))).toEqual({
      "api.name": "composite-parameter repoPreset [name]",
      "api.visibility": "composite-parameter repoPreset [private]",
      "api.settings.wiki": "composite-literal repoPreset",
      "api.settings.topics[0]": "composite-parameter repoPreset [topics.0]",
      "api.label": "composite-parameter repoPreset [name]",
      "owner.team": "direct",
      // A method on a real receiver is host code: nothing attributes its result.
      "owner.tag": "unknown host-call",
    });
  });

  test("a parameter origin names the call, the argument and the export it initializes", () => {
    const p = provenanceOf({ "presets.ts": PRESETS, "repos.ts": `import { repoPreset } from "./presets";\nexport const api = repoPreset({ name: "api", private: true });\n` }, "repos.ts");
    expect(p["api.name"]).toEqual({
      kind: "composite-parameter", composite: "repoPreset", instance: "api", parameters: ["name"],
      call: { file: "repos.ts", line: 2, column: 20 },
      arguments: { name: { file: "repos.ts", line: 2, column: 39 } },
    });
    expect(p["api.settings.wiki"]).toMatchObject({ kind: "composite-literal", literal: { file: "presets.ts", line: 3, column: 59 } });
  });

  test("an argument held in a const is followed to where it was written", () => {
    const p = provenanceOf({ "presets.ts": PRESETS, "repos.ts": `import { repoPreset } from "./presets";\nconst cfg = {\n  name: "api",\n};\nexport const api = repoPreset(cfg);\n` }, "repos.ts");
    expect(p["api.name"]).toMatchObject({ kind: "composite-parameter", arguments: { name: { file: "repos.ts", line: 3, column: 9 } } });
  });

  test("nested calls: the innermost writer wins", () => {
    const p = provenanceOf({
      "lib.ts": `function inner(o: { port: number }) { return { port: o.port, proto: "tcp" }; }
export function outer(p: { port: number; name: string }) { return { svc: inner({ port: p.port }), name: p.name, fixed: inner({ port: 9 }) }; }
`,
      "app.ts": `import { outer } from "./lib";\nexport const x = outer({ port: 80, name: "a" });\n`,
    }, "app.ts");
    expect(Object.fromEntries(Object.entries(p).map(([k, o]) => [k, brief(o)]))).toEqual({
      "x.svc.port": "composite-parameter inner [port]",
      "x.svc.proto": "composite-literal inner",
      "x.name": "composite-parameter outer [name]",
      // inner's parameter, even though outer wrote the 9 it was given.
      "x.fixed.port": "composite-parameter inner [port]",
      "x.fixed.proto": "composite-literal inner",
    });
    // The argument inner's port came from is written in outer's body.
    expect(p["x.svc.port"]).toMatchObject({ arguments: { port: { file: "lib.ts", line: 2 } } });
  });

  test("spreads and merges: a later member overwrites, a spread keeps its source's origins", () => {
    const p = provenanceOf({
      "presets.ts": PRESETS,
      "repos.ts": `import { repoPreset } from "./presets";
const base = { region: "eu", tier: "small" };
export const web = { ...repoPreset({ name: "web" }), ...base, tier: "large", list: [...["a"], "b"] };
`,
    }, "repos.ts");
    expect(brief(p["web.name"])).toBe("composite-parameter repoPreset [name]");
    expect(brief(p["web.settings.wiki"])).toBe("composite-literal repoPreset");
    expect(brief(p["web.region"])).toBe("direct");
    expect(brief(p["web.tier"])).toBe("direct");
    expect(brief(p["web.list[0]"])).toBe("direct");
    expect(brief(p["web.list[1]"])).toBe("direct");
    // Spread into a call's result, the call names no instance: it does not initialize the export by itself.
    expect(p["web.name"]).not.toHaveProperty("instance");
    // An absent optional parameter with a structured default is still that parameter.
    expect(brief(p["web.settings.topics"])).toBe("composite-parameter repoPreset [topics]");
  });

  test("a spread inside the function body merges the parameter with its literals", () => {
    const p = provenanceOf({
      "lib.ts": `export function withDefaults(o: { tags: Record<string, string> }) { return { tags: { managed: "yes", ...o.tags } }; }\n`,
      "app.ts": `import { withDefaults } from "./lib";\nexport const t = withDefaults({ tags: { "app.kubernetes.io/name": "api", managed: "no" } });\n`,
    }, "app.ts");
    expect(Object.fromEntries(Object.entries(p).map(([k, o]) => [k, brief(o)]))).toEqual({
      't.tags.managed': "composite-parameter withDefaults [tags.managed]",
      't.tags["app.kubernetes.io/name"]': "composite-parameter withDefaults [tags.app.kubernetes.io/name]",
    });
  });

  test("several parameters, destructuring, defaults and derived values", () => {
    const p = provenanceOf({
      "app.ts": `function svc(name: string, { port, replicas }: { port: number; replicas: number }, region = "eu") {
  const host = \`\${name}.\${region}\`;
  return { host, port, scale: replicas * 2, region, kind: "Service" };
}
export const a = svc("api", { port: 80, replicas: 2 });
`,
    }, "app.ts");
    expect(Object.fromEntries(Object.entries(p).map(([k, o]) => [k, brief(o)]))).toEqual({
      "a.host": "composite-parameter svc [name, region]",
      "a.port": "composite-parameter svc [port]",
      "a.scale": "composite-parameter svc [replicas]",
      // The default applied, and passing the argument is how it changes.
      "a.region": "composite-parameter svc [region]",
      "a.kind": "composite-literal svc",
    });
    expect((p["a.region"] as { arguments?: unknown }).arguments).toBeUndefined();
    expect(p["a.host"]).toMatchObject({ arguments: { name: { line: 5, column: 22 } } });
  });

  test("an imported value keeps the origin it had where it was folded", () => {
    const p = provenanceOf({
      "presets.ts": PRESETS,
      "base.ts": `import { repoPreset } from "./presets";\nexport const shared = repoPreset({ name: "shared" });\nexport const plain = { a: 1 };\n`,
      "app.ts": `import { shared, plain } from "./base";\nexport const both = { name: shared.name, a: plain.a };\n`,
    }, "app.ts");
    expect(brief(p["both.name"])).toBe("composite-parameter repoPreset [name]");
    expect(brief(p["both.a"])).toBe("direct");
  });

  test("a value through a host call is unknown, and stays unknown inside a function and through an operator", () => {
    const host = { ...DATA, intrinsics: [{ name: "upper", isTag: false, foldsEagerly: true }] };
    const r = foldProject(new Map([["app.ts", `function f(o: { n: string }) { return { m: o.n.trim(), k: [1, 2].join("-") + "!" }; }\nexport const x = f({ n: " a " });\nexport const y = { z: "q".repeat(2) + "r" };\n`]]), host);
    const v = r.verdicts.get("app.ts");
    if (v?.kind !== "fold") throw new Error(JSON.stringify(v));
    const p: ExportProvenance = Object.assign({}, ...v.provenance.values());
    expect(brief(p["x.m"])).toBe("unknown host-call");
    expect(brief(p["x.k"])).toBe("unknown host-call");
    expect(brief(p["y.z"])).toBe("unknown host-call");
    for (const o of Object.values(p)) if (o.kind === "unknown") expect(o.kind).not.toBe("direct");
  });

  test("an exported function emits no path; a primitive export is its own path", () => {
    const p = provenanceOf({ "app.ts": `export function f(x: number) { return x; }\nexport const n = f(3);\nexport const s = "k";\n` }, "app.ts");
    expect(Object.keys(p).sort()).toEqual(["n", "s"]);
    expect(brief(p.n)).toBe("composite-parameter f [x]");
    expect(brief(p.s)).toBe("direct");
  });

  test("a composite is named by the export name the call site resolved, not the name it was declared with (#250)", () => {
    const p = provenanceOf({
      "presets.ts": `${PRESETS}export { repoPreset as preset };\n`,
      "again.ts": `export { preset as rp } from "./presets";\n`,
      "repos.ts": `import { preset } from "./presets";\nimport { rp as other } from "./again";\nexport const api = preset({ name: "api" });\nexport const web = other({ name: "web" });\n`,
    }, "repos.ts");
    expect(brief(p["api.name"])).toBe("composite-parameter preset [name]");
    expect(brief(p["api.settings.wiki"])).toBe("composite-literal preset");
    expect(brief(p["web.name"])).toBe("composite-parameter rp [name]");
    // In its own module, an aliased export is named by its export name; an unexported function keeps its declared one.
    const q = provenanceOf({ "app.ts": `function f(x: number) { return { v: x }; }\nfunction g(x: number) { return { w: f(x) }; }\nexport { f as made };\nexport const n = f(3);\nexport const m = g(4);\n` }, "app.ts");
    expect(brief(q["n.v"])).toBe("composite-parameter made [x]");
    expect(brief(q["m.w.v"])).toBe("composite-parameter made [x]");
  });

  test("a local alias at the import does not rename the composite (#250)", () => {
    const host = { ...DATA, ownedSpecifierPrefixes: ["@host"], values: new Map([["@host/core", new Map<string, unknown>([["Composite", () => undefined]])]]) };
    const r = foldProject(new Map(Object.entries({
      "presets.ts": PRESETS,
      "lib.ts": `import { Composite } from "@host/core";\nexport const Site = Composite((p: { name: string }) => ({ bucket: { name: p.name, acl: "private" } }), "Site");\n`,
      "app.ts": `import { Site as Web } from "./lib";\nimport { repoPreset as mine } from "./presets";\nexport const blog = Web({ name: "blog" });\nexport const api = mine({ name: "api" });\n`,
    })), host);
    const v = r.verdicts.get("app.ts");
    if (v?.kind !== "fold") throw new Error(JSON.stringify(v));
    const p: ExportProvenance = Object.assign({}, ...v.provenance.values());
    expect(brief(p["blog.bucket.name"])).toBe("composite-parameter Site [name]");
    expect(brief(p["blog.bucket.acl"])).toBe("composite-literal Site");
    expect(brief(p["api.name"])).toBe("composite-parameter repoPreset [name]");
  });

  test("the reference adapter claims provenance and reports it per file", async () => {
    const { referenceDataHostAdapter } = await import("./index");
    expect(referenceDataHostAdapter.provenance).toBe(true);
    const r = await referenceDataHostAdapter.foldProject!(new Map([["presets.ts", PRESETS], ["repos.ts", `import { repoPreset } from "./presets";\nexport const api = repoPreset({ name: "api" });\n`]]), undefined, "open");
    if (r === "unavailable") throw new Error("unavailable");
    expect(r.provenance?.["repos.ts"]?.["api.name"]).toMatchObject({ kind: "composite-parameter", composite: "repoPreset", parameters: ["name"] });
  });
});
