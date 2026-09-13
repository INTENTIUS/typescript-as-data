---
title: "typescript-as-data"
description: "A specification for compiling TypeScript to configuration."
---

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

The second one has completion and a type error on a misspelt key. It reuses one helper across repositories. The tool reads the same object from either file and never executes the second one to get it. Three things follow, one page each below. New to any of this? [Start here](/typescript-as-data/start-here/).
