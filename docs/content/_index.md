---
title: "typescript-as-data"
description: "TypeScript in place of YAML. A file that is data is typed JSON, and the build reads it without executing it."
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

The second one has completion and a type error on a misspelt key. It reuses one helper across repositories. The tool reads the same object from either file and never executes the second one to get it.

## Folded, or run

A TypeScript file is a program that ends holding some exported values, and the build wants those values so it can write them out as YAML. There are two ways to get them. The build can **fold** the file, reading the source and computing the values from the text alone, or it can **run** the file, handing it to the JavaScript engine and taking whatever the exports hold when the program finishes. The YAML is the same either way. What differs is whether the build had to execute your file to produce it.

Folding is the default and the point. Running is the fallback for a file that is not data, and the verdict names the line that made it a program. The YAML is never run; only the TypeScript is, and only when it cannot be read.
