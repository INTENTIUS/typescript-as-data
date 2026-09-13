#!/usr/bin/env bash
# The smoke entrypoint (#146): one claim per invocation, verdict lines over
# exit codes, exit 0 only when every step held.
#
#   just smoke                    list the scenarios
#   just smoke no-execution       run one, against a throwaway Forgejo
#   BREAK=1 just smoke no-execution
#                                 sabotage the setup and require the scenario
#                                 to CATCH it, so the assertions are shown to
#                                 be load-bearing rather than scenery
#
# Knobs (all optional):
#   WARDEN_DIR=<checkout>   a forgejo-warden checkout to run; by default one is
#                           cloned at the commit .github/workflows/demo.yml pins
#   FORGEJO_E2E_URL/TOKEN   an already running sandbox; by default the checkout's
#                           Docker Compose sandbox is brought up and torn down
#   SMOKE_KEEP=1            leave the sandbox running afterwards
#
# Every step prints one line, `SMOKE op=<name> verdict=<pass|fail|caught> <detail>`.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)/smoke"
ROOT="$(cd "$HERE/../.." && pwd)"

list_scenarios() {
  echo "claims (run one with: just smoke <name>; BREAK=1 to watch it catch the broken case):"
  for s in "$HERE"/scenarios/*.sh; do
    b="$(basename "$s" .sh)"
    printf "  %-18s %s\n" "$b" "$(sed -n '2s/^# //p' "$s")"
  done
}

SCENARIO="${1:-}"
if [ -z "$SCENARIO" ]; then list_scenarios; exit 0; fi
if [ ! -f "$HERE/scenarios/$SCENARIO.sh" ]; then
  echo "no claim named '$SCENARIO'" >&2; list_scenarios >&2; exit 2
fi

export SMOKE_WORK="$(mktemp -d)"
# shellcheck source=smoke/lib.sh
. "$HERE/lib.sh"
trap 'sandbox_down; rm -rf "$SMOKE_WORK"' EXIT

resolve_warden
sandbox_up
banner "$SCENARIO"
# shellcheck source=/dev/null
. "$HERE/scenarios/$SCENARIO.sh"
echo
if [ "${BREAK:-}" = "1" ]; then echo "CAUGHT: claim '$SCENARIO' caught the broken case"; else echo "PASS: claim '$SCENARIO' held"; fi
