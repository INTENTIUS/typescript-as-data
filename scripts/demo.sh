#!/usr/bin/env bash
# The six steps of docs/content/try-it/_index.md, run against forgejo-warden's
# e2e sandbox (#84). The policy is cut out of the tutorial page itself, so the
# job and the page cannot say different things: if the fence changes, this
# runs the new one.
#
#   WARDEN_DIR=<forgejo-warden checkout, npm ci and npm run build done> \
#   TUTORIAL=<path to try-it/_index.md> bash scripts/demo.sh
#
# The sandbox must already be up (npm run e2e:up in WARDEN_DIR exported
# FORGEJO_E2E_URL and FORGEJO_E2E_TOKEN); tearing it down is the caller's.
set -euo pipefail

: "${WARDEN_DIR:?a forgejo-warden checkout}"
: "${TUTORIAL:?the tutorial page}"
: "${FORGEJO_E2E_URL:?run e2e:up first}"
: "${FORGEJO_E2E_TOKEN:?run e2e:up first}"

ORG=my-org
REPO=api
WORK="$(mktemp -d)"
WARDEN="node $WARDEN_DIR/bin/forgejo-warden.js"
API="$FORGEJO_E2E_URL/api/v1"
auth=(-H "Authorization: token $FORGEJO_E2E_TOKEN" -H "Content-Type: application/json")

step() { echo; echo "== $*"; }

step "1. the sandbox gets an org and an empty repo, which is what warden manages"
curl -fsS "${auth[@]}" -X POST "$API/orgs" -d "{\"username\":\"$ORG\"}" >/dev/null
curl -fsS "${auth[@]}" -X POST "$API/orgs/$ORG/repos" -d "{\"name\":\"$REPO\"}" >/dev/null

step "2. the policy, cut from the tutorial's governance.ts fence"
awk '/^ *```ts \{title="governance.ts"\}$/{f=1; next} f && /^ *```$/{exit} f' "$TUTORIAL" | sed 's/^   //' > "$WORK/governance.ts"
test -s "$WORK/governance.ts"
# The type import resolves against the checkout, the way a user's node_modules would.
mkdir -p "$WORK/node_modules/@intentius" && ln -s "$WARDEN_DIR" "$WORK/node_modules/@intentius/forgejo-warden"
cat "$WORK/governance.ts"

step "3. dry run, folding the file and also running it, refusing on disagreement"
$WARDEN reconcile --config "$WORK/governance.ts" --config-mode check \
  --base-url "$FORGEJO_E2E_URL" --token-env FORGEJO_E2E_TOKEN --mode dry-run | tee "$WORK/plan1.txt"
grep -q "hasWiki" "$WORK/plan1.txt"

step "4. apply"
$WARDEN reconcile --config "$WORK/governance.ts" --config-mode check \
  --base-url "$FORGEJO_E2E_URL" --token-env FORGEJO_E2E_TOKEN --mode apply | tee "$WORK/apply1.txt"
! grep -q "FAILED" "$WORK/apply1.txt"
test "$(curl -fsS "${auth[@]}" "$API/repos/$ORG/$REPO" | node -pe 'JSON.parse(require("fs").readFileSync(0)).has_wiki')" = false

step "5. drift: the wiki is turned back on out of band, and the next dry run reads it from live"
curl -fsS "${auth[@]}" -X PATCH "$API/repos/$ORG/$REPO" -d '{"has_wiki":true}' >/dev/null
$WARDEN reconcile --config "$WORK/governance.ts" --config-mode check \
  --base-url "$FORGEJO_E2E_URL" --token-env FORGEJO_E2E_TOKEN --mode dry-run | tee "$WORK/plan2.txt"
grep -q "hasWiki" "$WORK/plan2.txt"

step "6. reconcile"
$WARDEN reconcile --config "$WORK/governance.ts" --config-mode check \
  --base-url "$FORGEJO_E2E_URL" --token-env FORGEJO_E2E_TOKEN --mode apply | tee "$WORK/apply2.txt"
! grep -q "FAILED" "$WORK/apply2.txt"
test "$(curl -fsS "${auth[@]}" "$API/repos/$ORG/$REPO" | node -pe 'JSON.parse(require("fs").readFileSync(0)).has_wiki')" = false

echo; echo "demo: all six steps held"
