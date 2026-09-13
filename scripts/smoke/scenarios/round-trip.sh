# round-trip
# After an apply, reading live back and diffing against the declared source finds nothing; a drift is named exactly. ~1 min.

new_org smoke-round-trip; new_repo api; project_dir
POLICY="$PROJECT/governance.ts"
write_policy "$POLICY" "$ORG" api

step "1. apply the declared policy"
reconcile fold apply "$POLICY" > "$SMOKE_WORK/apply.txt" && ! grep -q "FAILED" "$SMOKE_WORK/apply.txt" && ok apply "applied" || fail apply "the apply failed"

step "2. read live back: the next plan is empty"
reconcile fold dry-run "$POLICY" > "$SMOKE_WORK/plan.txt"
if grep -qE "^(CREATE|UPDATE|DELETE):" "$SMOKE_WORK/plan.txt"; then fail plan-empty "the plan after apply still proposes changes"; fi
ok plan-empty "live equals declared: every cycle reports no changes"
grep -c "No changes" "$SMOKE_WORK/plan.txt" | sed 's/^/cycles with no changes: /' | evidence

if [ "${BREAK:-}" = "1" ]; then
  step "BREAK: one field changed on the server behind the policy's back"
  api -X PATCH "$(API)/repos/$ORG/api" -d '{"has_wiki":true}' >/dev/null
  reconcile fold dry-run "$POLICY" > "$SMOKE_WORK/plan2.txt"
  grep -q "hasWiki: true → false" "$SMOKE_WORK/plan2.txt" && caught plan-names-drift "the plan names the one drifted field and nothing else" || fail plan-names-drift "the drift was not planned"
  grep -B2 "hasWiki" "$SMOKE_WORK/plan2.txt" | evidence
fi
