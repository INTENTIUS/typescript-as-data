#!/usr/bin/env bash
# Helpers for the smoke scenarios (#146). Sourced by scripts/smoke.sh.

# The output contract: every step prints one verdict line the reader can
# check and a script can grep, `SMOKE op=<name> verdict=<pass|fail|caught>`.
ok()     { echo "SMOKE op=$1 verdict=pass $2"; }
caught() { echo "SMOKE op=$1 verdict=caught $2"; }
fail()   { echo "SMOKE op=$1 verdict=fail $2" >&2; exit 1; }
step()   { echo; echo "== $*"; }
evidence() { sed 's/^/      /'; }

banner() {
  echo "smoke: claim '$1'${BREAK:+ with BREAK=1}"
  echo "warden: $WARDEN_PROVENANCE"
  echo "sandbox: $FORGEJO_E2E_URL"
}

# The forgejo-warden under test: WARDEN_DIR, or a clone at the commit the
# weekly demo pins, so a local run and CI exercise the same code.
resolve_warden() {
  if [ -z "${WARDEN_DIR:-}" ]; then
    local ref
    ref="$(sed -n 's/^  WARDEN_REF: \([0-9a-f]*\).*/\1/p' "$ROOT/.github/workflows/demo.yml")"
    WARDEN_DIR="$ROOT/.forgejo-warden"
    if [ ! -d "$WARDEN_DIR/.git" ]; then
      git clone -q https://github.com/INTENTIUS/forgejo-warden "$WARDEN_DIR"
    fi
    if [ "$(git -C "$WARDEN_DIR" rev-parse HEAD)" != "$ref" ]; then
      git -C "$WARDEN_DIR" fetch -q origin "$ref" && git -C "$WARDEN_DIR" checkout -q "$ref"
      rm -rf "$WARDEN_DIR/dist"
    fi
    WARDEN_PROVENANCE="INTENTIUS/forgejo-warden at $ref (demo.yml's pin)"
  else
    WARDEN_PROVENANCE="WARDEN_DIR=$WARDEN_DIR at $(git -C "$WARDEN_DIR" rev-parse --short HEAD 2>/dev/null || echo '?')"
  fi
  export WARDEN_DIR
  [ -d "$WARDEN_DIR/node_modules" ] || (cd "$WARDEN_DIR" && npm ci --silent --no-audit --no-fund)
  [ -f "$WARDEN_DIR/dist/index.js" ] || (cd "$WARDEN_DIR" && npm run build --silent)
}

# warden's own Compose sandbox, from scratch: its bootstrap mints a token by a
# fixed name, so a second bootstrap against a running instance fails, and a
# fresh instance is what a scenario wants anyway.
SANDBOX_OWNED=0
sandbox_up() {
  if [ -n "${FORGEJO_E2E_URL:-}" ] && [ -n "${FORGEJO_E2E_TOKEN:-}" ]; then return; fi
  docker info >/dev/null 2>&1 || { echo "the docker daemon is not running, and the sandbox is a Forgejo on Docker Compose" >&2; exit 1; }
  (cd "$WARDEN_DIR" && docker compose -f e2e/docker-compose.yml down -v >/dev/null 2>&1 || true)
  (cd "$WARDEN_DIR" && bash e2e/bootstrap.sh > "$SMOKE_WORK/env.sh" 2> "$SMOKE_WORK/bootstrap.log") || { cat "$SMOKE_WORK/bootstrap.log" >&2; exit 1; }
  # shellcheck source=/dev/null
  . "$SMOKE_WORK/env.sh"
  export FORGEJO_E2E_URL FORGEJO_E2E_TOKEN
  SANDBOX_OWNED=1
}
sandbox_down() {
  if [ "$SANDBOX_OWNED" = 1 ] && [ "${SMOKE_KEEP:-}" != 1 ]; then
    (cd "$WARDEN_DIR" && docker compose -f e2e/docker-compose.yml down -v >/dev/null 2>&1 || true)
  fi
}

# One org per scenario on the fresh instance, and a project directory whose
# node_modules resolves the policy's type import the way a user's would.
api() { curl -fsS -H "Authorization: token $FORGEJO_E2E_TOKEN" -H "Content-Type: application/json" "$@"; }
API() { echo "$FORGEJO_E2E_URL/api/v1"; }
# Suffixed, so the scenarios can share one sandbox (CI runs all eight on one).
new_org() {
  ORG="$1-$(head -c 3 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  api -X POST "$(API)/orgs" -d "{\"username\":\"$ORG\"}" >/dev/null
}
new_repo() { api -X POST "$(API)/orgs/$ORG/repos" -d "{\"name\":\"$1\"}" >/dev/null; }
project_dir() {
  PROJECT="$SMOKE_WORK/project"
  mkdir -p "$PROJECT/node_modules/@intentius"
  ln -sfn "$WARDEN_DIR" "$PROJECT/node_modules/@intentius/forgejo-warden"
}
warden() { node "$WARDEN_DIR/bin/forgejo-warden.js" "$@"; }
# `reconcile <config-mode> <mode> <policy>`: the reconcile command with the sandbox filled in; exit status is the caller's to read.
reconcile() {
  warden reconcile --config "$3" --config-mode "$1" --base-url "$FORGEJO_E2E_URL" --token-env FORGEJO_E2E_TOKEN --mode "$2"
}

# A policy for an org and a repo: the repo's settings, the shape try-it shows.
# No branch protection, since the sandbox repo is empty and has no branch to
# protect, so a plan with one could never empty.
write_policy() { # $1 path, $2 org, $3 repo, $4 extra lines inside the org (optional)
  cat > "$1" <<TS
import type { GovernanceConfig } from "@intentius/forgejo-warden";

export default {
  orgs: {
    "$2": {
      ${4:-}
      repos: {
        $3: { hasWiki: false, allowSquashMerge: true, topics: ["service", "api"] },
      },
    },
  },
} satisfies GovernanceConfig;
TS
}
