---
title: "Try it in ten minutes"
description: "The whole loop on a laptop, with a throwaway Forgejo, no account, and nothing at risk."
weight: 20
diataxis: tutorial
hideChildren: true
---

forgejo-warden keeps a Forgejo org in a declared state. Its e2e stack stands up a throwaway Forgejo on Docker Compose and mints a token, so you can declare, plan, apply, drift, and reconcile without touching a real instance. Docker and Node 22 are the prerequisites.

## Paste this to an agent

```text
Clone https://github.com/INTENTIUS/forgejo-warden and run `npm ci`. Confirm
Docker is running (`docker info`). Start the sandbox with
`eval "$(npm run --silent e2e:up)"`, which exports FORGEJO_E2E_URL and
FORGEJO_E2E_TOKEN. Write a governance policy, as governance.ts, for one org with one repo that
disables the wiki, allows squash merges, and protects `main` with one
required approval and a `ci` status check. Run a dry-run reconcile against the sandbox and show me
the plan. Do not apply until I say so. When I do, apply, then tell me to
change the repo's wiki setting in the web UI at http://localhost:3000, run
another dry-run, and show me the drift. Finish with `npm run e2e:down`.
```

## By hand

1. Stand up the sandbox.

   ```bash
   git clone https://github.com/INTENTIUS/forgejo-warden && cd forgejo-warden
   npm ci
   eval "$(npm run --silent e2e:up)"
   ```

2. Write the policy, in YAML or in TypeScript. The loader reads either; the `.ts` form is folded to its value without being run ([forgejo-warden#33](https://github.com/INTENTIUS/forgejo-warden/pull/33)).

   ```ts {title="governance.ts"}
   import type { GovernanceConfig } from "@intentius/forgejo-warden";

   export const policy = {
     orgs: {
       "warden-admin": {
         repos: {
           api: {
             hasWiki: false,
             allowSquashMerge: true,
             branchProtection: [{ ruleName: "main", requiredApprovals: 1, enableStatusCheck: true, statusCheckContexts: ["ci"] }],
           },
         },
       },
     },
   } satisfies GovernanceConfig;
   ```

3. See the plan. Reads only; changes nothing.

   ```bash
   forgejo-warden reconcile --config governance.ts \
     --base-url "$FORGEJO_E2E_URL" --token-env FORGEJO_E2E_TOKEN --mode dry-run
   ```

4. Apply it, then open http://localhost:3000 and look at the repo.

   ```bash
   forgejo-warden reconcile --config governance.ts \
     --base-url "$FORGEJO_E2E_URL" --token-env FORGEJO_E2E_TOKEN --mode apply
   ```

5. Drift. In the web UI, turn the wiki back on. Run step 3 again: the plan shows the one change, read from the live instance. There is no state file to be stale.

6. Reconcile with step 4, then tear down.

   ```bash
   npm run e2e:down
   ```

## What you just saw

The policy is data. Nothing in it ran, and nothing needed to; the plan is computed from the declared values and the live org. `--config-mode check` folds the file and also runs it, and refuses if the two disagree, which is the guarantee made visible. `--config-mode run` skips the fold for anyone who only wants typed JSON. Deletes were never proposed, because nothing was marked `owned`. The same file works against Codeberg or any self-hosted Forgejo by changing `--base-url`.

The second chapter, importing an existing artifact and rebuilding it byte for byte through generated source, is chant's, and lands here with its measurement when [the round-trip property](https://github.com/INTENTIUS/typescript-as-data/issues/80) does.
