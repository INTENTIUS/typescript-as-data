---
title: "typescript-as-data"
description: "TypeScript configuration, read as data."
---

- [Checked before anything runs](/typescript-as-data/what-it-enables/checked-before-anything-runs/)
- [Adopt what you already have](/typescript-as-data/what-it-enables/adopt-what-you-have/)
- [Drift lands on the line you wrote](/typescript-as-data/what-it-enables/drift-to-source/)

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
