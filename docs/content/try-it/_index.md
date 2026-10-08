---
title: "Try it"
description: "Declare a policy, apply it to a throwaway Forgejo, drift it and reconcile, on your laptop."
weight: 20
---

forgejo-warden keeps a Forgejo org in a declared state. Its test stack starts a throwaway Forgejo server on Docker, so nothing here touches a real account. You need Git and Node 22 or later. Docker has to be running.

## Paste this to an agent

```text
Clone https://github.com/INTENTIUS/forgejo-warden and run `npm ci`. Confirm
Docker is running. Start the sandbox with
`eval "$(npm run --silent e2e:up)"`, which exports FORGEJO_E2E_URL and
FORGEJO_E2E_TOKEN. Create an org `my-org` with an empty repo `api` through the
API. Write governance.ts for that repo: no wiki, squash merges allowed, and
`main` protected with one required approval and a `ci` status check. Show me
a dry-run reconcile. Apply when I say so, then tell me to turn the wiki on in
the web UI at http://localhost:3000 and show me the drift. Finish with
`npm run e2e:down`.
```

## By hand

1. Start the sandbox and create an org with an empty repo.

   ```bash
   git clone https://github.com/INTENTIUS/forgejo-warden && cd forgejo-warden
   npm ci && npm run build
   eval "$(npm run --silent e2e:up)"
   auth=(-H "Authorization: token $FORGEJO_E2E_TOKEN" -H "Content-Type: application/json")
   curl -fsS "${auth[@]}" -X POST "$FORGEJO_E2E_URL/api/v1/orgs" -d '{"username":"my-org"}'
   curl -fsS "${auth[@]}" -X POST "$FORGEJO_E2E_URL/api/v1/orgs/my-org/repos" -d '{"name":"api"}'
   ```

2. Write the policy.

   ```ts {title="governance.ts"}
   import type { GovernanceConfig } from "@intentius/forgejo-warden";

   export const policy = {
     orgs: {
       "my-org": {
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

3. See the plan. This changes nothing.

   ```bash
   node bin/forgejo-warden.js reconcile --config governance.ts \
     --base-url "$FORGEJO_E2E_URL" --token-env FORGEJO_E2E_TOKEN --mode dry-run
   ```

4. Apply it, then open http://localhost:3000/my-org/api.

   ```bash
   node bin/forgejo-warden.js reconcile --config governance.ts \
     --base-url "$FORGEJO_E2E_URL" --token-env FORGEJO_E2E_TOKEN --mode apply
   ```

5. Turn the wiki back on in the web UI and run step 3 again. The plan shows the one change, read from the live server.

6. Run step 4 to reconcile, then tear down.

   ```bash
   npm run e2e:down
   ```

The policy file was read, never run. To fold a file with nothing installed, [use the browser](/typescript-as-data/try-it/in-the-browser/).
