---
title: "Try it in ten minutes"
description: "The whole loop on a laptop, with a throwaway Forgejo, no account, and nothing at risk."
weight: 20
diataxis: tutorial
---

forgejo-warden keeps a Forgejo org in a declared state. Forgejo is a code-hosting server, like GitHub, that you can run yourself. warden's e2e stack stands up a throwaway one on Docker Compose and mints a token. You can declare a policy and apply it, then drift and reconcile, without touching a real instance.

## Before you start

You need a terminal and Git, plus Node 22 or later and Docker running. [Start here](/typescript-as-data/start-here/#what-you-need-on-your-machine) says what each is and where to get it. Every command below is typed into the terminal, one block at a time, from inside the folder the first step creates. Nothing here touches a real account.

## Paste this to an agent

```text
Clone https://github.com/INTENTIUS/forgejo-warden and run `npm ci`. Confirm
Docker is running (`docker info`). Start the sandbox with
`eval "$(npm run --silent e2e:up)"`, which exports FORGEJO_E2E_URL and
FORGEJO_E2E_TOKEN. Create an org `my-org` with an empty repo `api` through the API. Write a
governance policy, as governance.ts, for that org and repo that disables
the wiki, allows squash merges, and protects `main` with one required
approval and a `ci` status check. Run a dry-run reconcile against the sandbox and show me
the plan. Do not apply until I say so. When I do, apply, then tell me to
change the repo's wiki setting in the web UI at http://localhost:3000, run
another dry-run, and show me the drift. Finish with `npm run e2e:down`.
```

## By hand

1. Stand up the sandbox, and give it an org with an empty repo. The first line fetches warden's source and moves into it, the second installs its dependencies and builds it, and the third starts the throwaway server and puts its address and a token into two variables the later commands read. The two `curl` lines ask the server to create an organisation and an empty repository, because warden keeps what exists in a declared state; it does not create the org, and a repo comes from a `repoBaselines` entry or, as here, from one API call.

   ```bash
   git clone https://github.com/INTENTIUS/forgejo-warden && cd forgejo-warden
   npm ci && npm run build
   eval "$(npm run --silent e2e:up)"
   auth=(-H "Authorization: token $FORGEJO_E2E_TOKEN" -H "Content-Type: application/json")
   curl -fsS "${auth[@]}" -X POST "$FORGEJO_E2E_URL/api/v1/orgs" -d '{"username":"my-org"}'
   curl -fsS "${auth[@]}" -X POST "$FORGEJO_E2E_URL/api/v1/orgs/my-org/repos" -d '{"name":"api"}'
   ```

2. Write the policy, in YAML or in TypeScript. The loader reads either; the `.ts` form is folded to its value without being run ([forgejo-warden#33](https://github.com/INTENTIUS/forgejo-warden/pull/33)).

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

3. See the plan. Reads only; changes nothing.

   ```bash
   node bin/forgejo-warden.js reconcile --config governance.ts \
     --base-url "$FORGEJO_E2E_URL" --token-env FORGEJO_E2E_TOKEN --mode dry-run
   ```

4. Apply it, then open http://localhost:3000/my-org/api and look at the repo.

   ```bash
   node bin/forgejo-warden.js reconcile --config governance.ts \
     --base-url "$FORGEJO_E2E_URL" --token-env FORGEJO_E2E_TOKEN --mode apply
   ```

5. Drift. In the web UI, turn the wiki back on (or `PATCH` the repo with `{"has_wiki":true}`). Run step 3 again: the plan shows the one change, read from the live instance. There is no state file to be stale.

6. Reconcile with step 4, then tear down.

   ```bash
   npm run e2e:down
   ```

## What happened

The policy is data. Nothing in it ran, and nothing needed to; the plan is computed from the declared values and the live org. `--config-mode check` folds the file and also runs it, and refuses if the two disagree, which is the guarantee made visible. `--config-mode run` skips the fold for anyone who only wants typed JSON. Deletes were never proposed, because nothing was marked `owned`. The same file works against Codeberg or any self-hosted Forgejo by changing `--base-url`.

To see the evaluator itself with nothing installed, [fold a file in your browser](/typescript-as-data/try-it/in-the-browser/).

[A workflow](https://github.com/INTENTIUS/typescript-as-data/blob/main/.github/workflows/demo.yml) runs these six steps every week against the same sandbox, with the policy cut out of this page by `scripts/demo.sh`, so the page cannot rot.

The second chapter, importing an existing artifact and rebuilding it byte for byte through generated source, is chant's. The property it rests on is [`F-Val-Source`](/typescript-as-data/spec/normative/values/), in the specification since `1.5`; the chapter lands here with chant's measurement.
