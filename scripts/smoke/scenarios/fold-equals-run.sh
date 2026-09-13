# fold-equals-run
# Folding and running the same policy give the same values, and a file that would differ is refused before either is trusted. ~1 min.

new_org smoke-fold-equals-run; new_repo api; project_dir
POLICY="$PROJECT/governance.ts"
write_policy "$POLICY" "$ORG" api

step "1. --config-mode check folds the file and runs it, and refuses if the two disagree"
reconcile check dry-run "$POLICY" > "$SMOKE_WORK/plan.txt" && ok check-agrees "fold and run agree on the policy; the plan is theirs" || fail check-agrees "check mode refused a data file"
grep -B1 "hasWiki" "$SMOKE_WORK/plan.txt" | evidence

if [ "${BREAK:-}" = "1" ]; then
  step "BREAK: a setting read from the environment, which a run would leak into the plan"
  sed 's/hasWiki: false/hasWiki: process.env.SMOKE_WIKI !== "on"/' "$POLICY" > "$PROJECT/leaky.ts"
  grep -n "process.env" "$PROJECT/leaky.ts" | evidence
  if reconcile check dry-run "$PROJECT/leaky.ts" > /dev/null 2> "$SMOKE_WORK/err.txt"; then
    fail check-refuses "check mode accepted a file that reads the environment"
  fi
  grep -q "is not data (F-Eval-Ident)" "$SMOKE_WORK/err.txt" && caught check-refuses "the fold refused the file at the environment read, naming the rule and the line" || fail check-refuses "refused for another reason: $(cat "$SMOKE_WORK/err.txt")"
  sed 's/^forgejo-warden: error: //' "$SMOKE_WORK/err.txt" | cut -c1-200 | evidence
  step "what a run alone would have done with it"
  SMOKE_WIKI=on reconcile run dry-run "$PROJECT/leaky.ts" | grep -B1 "hasWiki" | evidence || true
  echo "      (the plan depends on the shell it ran in; the fold has no shell)"
fi
