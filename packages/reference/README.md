# @intentius/tsad-reference

A reference implementation of the specification in `spec/`, written from the
specification text and nothing else (#50).

## What it implements, and what it does not

Implemented: shape classification, expression evaluation (J1), the per-file
verdict and the identity-taint fixpoint (J2, J3, since #60), revival through
a host's real constructors (F-Val-Fate, since #64), and the host interface's
registry, helper allowlist, owned-specifier prefixes and values. It declares
the specification version it implements (`specVersion` on its adapter), and
the suite holds that to `spec/VERSION`.

Not implemented, with the reason for each: `CAVEATS.md`. F-Call step 6,
invoking a project module in open mode, is the one thing a fixture cannot ask
of it.

## As a package

`@intentius/tsad-reference` depends on `@intentius/tsad-conformance` for the
adapter and host types only. Its major and minor are the specification version
it implements; the patch is its own.

## Field provenance (F-Obs-Provenance)

`foldProject` reports, for every file that folds, an origin for each path an
export emits: `verdict.provenance` maps an export name to a record of path to
`FoldFieldOrigin`. A path is the export name followed by the property path, as
a TypeScript accessor writes it (`api.settings.topics[0]`,
`b.props.tags["app.kubernetes.io/name"]`).

An origin has one of four kinds. `direct` is a value written at the export.
`composite-parameter` is a value read from a parameter of an interpreted
project function or composite, with the parameter paths, where the call was
written and where each argument was written. `composite-literal` is a value
the function body fixes, with where it does. `unknown` is a value host code
produced, such as a method call's result. The innermost call wins, and an
`unknown` is never reported as `direct`.

```ts
// presets.ts
export function repoPreset(opts: { name: string; private?: boolean }) {
  return { name: opts.name, settings: { wiki: false } };
}
// repos.ts
import { repoPreset } from "./presets";
export const api = repoPreset({ name: "api", private: true });
```

```json
{
  "api.name": {
    "kind": "composite-parameter", "composite": "repoPreset", "instance": "api", "parameters": ["name"],
    "call": { "file": "repos.ts", "line": 2, "column": 20 },
    "arguments": { "name": { "file": "repos.ts", "line": 2, "column": 39 } }
  },
  "api.settings.wiki": {
    "kind": "composite-literal", "composite": "repoPreset", "instance": "api",
    "call": { "file": "repos.ts", "line": 2, "column": 20 },
    "literal": { "file": "presets.ts", "line": 2, "column": 47 }
  }
}
```

`src/provenance.ts` states the rules for parameter paths, defaults, spreads
and derived values.

## Provenance

From #19 until #50 these files were a *port* of chant's, kept current by a
sync script and a list of recorded cuts. That guaranteed agreement and made
agreement uninformative: the cross-check was comparing the same code with
itself. #50 replaced the ported evaluation layer with one written from the
specification text.

**One honest limit on how independent that is.** The author of the rewrite had
previously read chant's implementation closely, while writing the
specification from it. The rewrite was done from `grammar.md` and
`judgments.md` without consulting the source, but it is not the test a reader
who had never seen chant would constitute. What it does establish is that the
specification text is complete enough to implement from, and it found one
place where it was not: `spec/grammar.md`'s definition of an *unclaimed*
callee, which four normative sentences used and none defined (#51).

The cut list and the sync script are in git history at the commit that removed
them, as the record of what the host interface was derived from.
