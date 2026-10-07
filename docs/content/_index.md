---
title: "typescript-as-data"
description: "TypeScript configuration read as data, so it is checked before anything runs, adopted from what you already have, and traced to the line you wrote when it drifts."
---

Your configuration is a TypeScript file. A separate program reads it and works out the values itself, refusing anything it would have to run.

Not the type system, so no `tsc` and no types involved. Not a sandbox either. Think a JSON parser that also understands `1 + 1`, spread, and references into other files.

A call to `Date.now()` is refused rather than executed, and that file falls back to being run normally. You are told which files those were. What comes back is reproducible from the source alone, which is the thing running it can never give you.

## A policy in YAML and in TypeScript

```yaml {title="governance.yml"}
orgs:
  my-org:
    repos:
      api:
        hasWiki: false
        allowSquashMerge: true
        topics: [service, api]
        branchProtection:
          - ruleName: main
            requiredApprovals: 1
            enableStatusCheck: true
            statusCheckContexts: [ci]
```

```ts {title="governance.ts"}
import type { GovernanceConfig } from "@intentius/forgejo-warden";
import { service } from "./helpers.ts";

export const policy = {
  orgs: {
    "my-org": {
      repos: { api: service("api"), web: service("web") },
    },
  },
} satisfies GovernanceConfig;
```

The second one has completion and a type error on a misspelt key, and it reuses one helper across repositories. Both files give the tool the same object. Three claims follow. It is checked before anything runs, you can adopt what you already have, and drift lands on the line you wrote. Each has a page, linked under the loop below. New to any of this? [Start here](/typescript-as-data/start-here/).
