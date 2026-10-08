---
title: "typescript-as-data"
description: "TypeScript configuration read as data, so it is checked before anything runs, adopted from what you already have, and traced to the line you wrote when it drifts."
---

Your configuration is a TypeScript file. The build reads it and works out the values without running any statement you wrote. A file that loops or calls `Date.now()` cannot be read that way. Those files are run instead, and you are told which they were.

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

The editor gives you completion and catches a misspelt key. CDK and Pulumi give you that too, but they have to run the program to learn what it declares. Reading it instead gives you three things they cannot:

- [Checked before anything runs](/typescript-as-data/what-it-enables/checked-before-anything-runs/)
- [Adopt what you already have](/typescript-as-data/what-it-enables/adopt-what-you-have/)
- [Drift lands on the line you wrote](/typescript-as-data/what-it-enables/drift-to-source/)

The rules are in [the specification](https://github.com/INTENTIUS/typescript-as-data/tree/main/spec). A reference implementation written from it agrees with chant {{< figure "chantPin" >}} on all {{< figure "corpus.agreed" >}} comparable files of chant's examples. [chant](https://intentius.io/chant/) and [forgejo-warden](https://github.com/INTENTIUS/forgejo-warden) build on it.
