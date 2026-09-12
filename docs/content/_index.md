---
title: "typescript-as-data"
description: "TypeScript in place of YAML. A file that is data is typed JSON, and it means the same thing whether it is folded or run."
---

## The same policy twice

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

The second one has completion and a type error on a misspelt key. It reuses one helper across repositories. The tool reads the same object from either file and never runs the second one to get it.
