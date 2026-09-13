# rules-over-values
# A rule over the declared values, the removal cap, holds a plan that removes too much before anything is applied. ~1 min.

new_org smoke-rules-over-values; new_repo api; project_dir
for v in V1 V2 V3 V4 V5; do api -X POST "$(API)/orgs/$ORG/actions/variables/$v" -d '{"value":"x"}' >/dev/null; done
count_vars() { api "$(API)/orgs/$ORG/actions/variables?limit=50" | node -pe 'JSON.parse(require("fs").readFileSync(0)).length'; }
vars() { local out=""; for v in "$@"; do out="$out{ name: \"$v\", value: \"x\" }, "; done; echo "$out"; }

step "1. five owned variables live; the policy declares four, so the plan removes one of five"
write_policy "$PROJECT/four.ts" "$ORG" api "owned: true, variables: [$(vars V1 V2 V3 V4)],"
reconcile fold apply "$PROJECT/four.ts" > "$SMOKE_WORK/apply1.txt" && grep -q "1 to delete" "$SMOKE_WORK/apply1.txt" && [ "$(count_vars)" = 4 ] \
  && ok cap-allows "one of five removed: 20% is under the removal cap of 25%, and it applied" || fail cap-allows "the small removal did not apply"
grep -A1 "^DELETE:" "$SMOKE_WORK/apply1.txt" | evidence

if [ "${BREAK:-}" = "1" ]; then
  step "BREAK: the policy declares one of the remaining four, so the plan removes three"
  write_policy "$PROJECT/one.ts" "$ORG" api "owned: true, variables: [$(vars V1)],"
  if reconcile fold apply "$PROJECT/one.ts" > "$SMOKE_WORK/apply2.txt"; then fail cap-blocks "the apply went through"; fi
  grep -q "GUARDRAIL BLOCK" "$SMOKE_WORK/apply2.txt" && [ "$(count_vars)" = 4 ] \
    && caught cap-blocks "removing three of four is 75%, the guardrail blocked the apply, and all four variables are still there" || fail cap-blocks "no block, or variables were deleted"
  grep "GUARDRAIL BLOCK" "$SMOKE_WORK/apply2.txt" | cut -c1-220 | evidence
fi
