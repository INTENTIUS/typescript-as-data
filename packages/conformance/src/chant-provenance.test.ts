/**
 * #236: chant's fold provenance (chant#3598) through the adapter. The mapping
 * is tested on a hand-written record so it holds at any pin; the live check
 * runs when the installed chant carries provenance and checks the guard when
 * it does not.
 */
import { describe, expect, test } from "vitest";
import { chantAdapter, mapFoldProvenance } from "./adapters/chant";
import { requireHost } from "./host";

describe("chant provenance mapping (#236)", () => {
  test("entity names resolve to namespace paths, fields to accessors under props", () => {
    const bucket = (props: Record<string, unknown>) => ({ entityType: "Bucket", props });
    const exports = {
      b: bucket({ name: "x", tags: { "a.b": "c", list: [1, 2] } }),
      many: [bucket({ name: "m0" }), bucket({ name: "m1" })],
      store: { data: bucket({ name: "app" }) },
      my_thing: bucket({ name: "u" }),
      site: { main: { bucket: bucket({ name: "web" }) } },
    };
    const out = mapFoldProvenance({
      b: { fields: { name: { kind: "direct" }, "tags.a.b": { kind: "direct" }, "tags.list": { kind: "unknown", reason: "no-provenance" } } },
      many_1: { fields: { name: { kind: "direct" } } },
      storeData: { composite: "Store", instance: "store", fields: { name: { kind: "composite-parameter", composite: "Store", instance: "store", parameters: ["name"] } } },
      my_thing: { fields: { name: { kind: "composite-literal", composite: "C" } } },
      // A nested member: the instance, then each member with its first letter upper-cased.
      siteMainBucket: { composite: "Inner", instance: "site", fields: { name: { kind: "composite-parameter", composite: "Inner", instance: "site", parameters: ["name"] } } },
      // An entity the namespace does not hold (a stack-prefixed name) is left out rather than guessed.
      PrefixedB: { fields: { name: { kind: "direct" } } },
    }, exports, "app.ts");
    expect(out).toEqual({
      "b.props.name": { kind: "direct" },
      'b.props.tags["a.b"]': { kind: "direct" },
      "b.props.tags.list": { kind: "unknown", reason: "no-provenance" },
      "many[1].props.name": { kind: "direct" },
      "store.data.props.name": { kind: "composite-parameter", composite: "Store", instance: "store", parameters: ["name"] },
      "my_thing.props.name": { kind: "composite-literal", composite: "C" },
      "site.main.bucket.props.name": { kind: "composite-parameter", composite: "Inner", instance: "site", parameters: ["name"] },
    });
  });

  test("the adapter claims provenance exactly when the installed chant reports it", async () => {
    const files = new Map([["direct.ts", 'import { Bucket } from "@tsad/shapes";\nexport const b = new Bucket({ name: "x" });\n']]);
    const r = await chantAdapter.foldProject!(files, requireHost("shapes"));
    expect(r).not.toBe("unavailable");
    if (r === "unavailable") return;
    if (process.env.TSAD_EXPECT_CHANT_PROVENANCE) expect(chantAdapter.provenance).toBe(true);
    if (!chantAdapter.provenance) {
      expect(r.provenance).toBeUndefined();
      return;
    }
    expect(r.provenance?.["direct.ts"]?.["b.props.name"]).toEqual({ kind: "direct" });
  });
});
