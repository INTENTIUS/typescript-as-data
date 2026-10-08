# round-trip
# After an apply, reading live back finds nothing; a drift is named exactly, with the preset argument and source line it came from. ~1 min.

new_org smoke-round-trip; new_repo api; project_dir
POLICY="$PROJECT/governance.ts"
write_preset_policy "$POLICY" "$ORG" api

step "1. apply the declared policy"
reconcile fold apply "$POLICY" > "$SMOKE_WORK/apply.txt" && ! grep -q "FAILED" "$SMOKE_WORK/apply.txt" && ok apply "applied" || fail apply "the apply failed"

step "2. read live back: the next plan is empty"
reconcile fold dry-run "$POLICY" > "$SMOKE_WORK/plan.txt"
if grep -qE "^(CREATE|UPDATE|DELETE):" "$SMOKE_WORK/plan.txt"; then fail plan-empty "the plan after apply still proposes changes"; fi
ok plan-empty "live equals declared: every cycle reports no changes"
grep -c "No changes" "$SMOKE_WORK/plan.txt" | sed 's/^/cycles with no changes: /' | evidence

step "3. the return leg: a drift on the server is traced to the source that set it"
# The preset sets allowMergeCommits from its squashOnly argument; hasWiki is written directly.
SQUASH_LINE="$(grep -n 'reviewPreset({ squashOnly: true })' "$POLICY" | cut -d: -f1)"
if [ "${BREAK:-}" = "1" ]; then
  FIELD=hasWiki; API_BODY='{"has_wiki":true}'
else
  FIELD=allowMergeCommits; API_BODY='{"allow_merge_commits":true}'
fi
api -X PATCH "$(API)/repos/$ORG/api" -d "$API_BODY" >/dev/null
reconcile fold dry-run "$POLICY" > "$SMOKE_WORK/plan2.txt"
grep -q "$FIELD: true → false" "$SMOKE_WORK/plan2.txt" && ok plan-names-drift "the plan names the drifted field $FIELD" || fail plan-names-drift "the drift of $FIELD was not planned"
grep -A1 "$FIELD" "$SMOKE_WORK/plan2.txt" | evidence
WANT="reviewPreset(...) argument squashOnly at $POLICY:$SQUASH_LINE:"
if grep -A1 "$FIELD: true → false" "$SMOKE_WORK/plan2.txt" | grep -qF -- "<- $WANT"; then
  if [ "${BREAK:-}" = "1" ]; then fail origin-names-preset "the plan attributed $FIELD to the preset, so the check proves nothing"; fi
  ok origin-names-preset "the plan names the preset, its argument squashOnly and the source line $SQUASH_LINE"
elif [ "${BREAK:-}" = "1" ]; then
  caught origin-names-preset "$FIELD is set directly in the policy, so the plan does not point at the preset and the check refuses it"
else
  fail origin-names-preset "the plan does not trace allowMergeCommits to $WANT"
fi
