# no-execution
# The fold produces the plan without running the file, so a side effect the file carries never happens. ~1 min.

new_org smoke-no-execution; new_repo api; project_dir
MARKER="$SMOKE_WORK/marker.txt"
POLICY="$PROJECT/governance.ts"
write_policy "$POLICY" "$ORG" api
# The planted side effect: a top-level call that writes a file. S-Module says a
# non-exported statement is invisible to the fold and never performed.
{ echo 'import { writeFileSync } from "node:fs";'; echo "writeFileSync(\"$MARKER\", \"the file ran\");"; cat "$POLICY"; } > "$PROJECT/planted.ts" && mv "$PROJECT/planted.ts" "$POLICY"

step "1. the policy carries a side effect at top level"
grep -n "writeFileSync" "$POLICY" | evidence

step "2. fold the file to its plan"
rm -f "$MARKER"
reconcile fold dry-run "$POLICY" > "$SMOKE_WORK/plan.txt" && grep -q "hasWiki: true → false" "$SMOKE_WORK/plan.txt" \
  && ok fold-plans "the plan names the repo setting the policy declares" || fail fold-plans "no plan from the fold"
grep -B1 "hasWiki" "$SMOKE_WORK/plan.txt" | evidence

step "3. the side effect never happened"
[ ! -e "$MARKER" ] && ok no-side-effect "marker absent: the fold read the file and ran none of it" || fail no-side-effect "the marker exists, so something ran the file"

if [ "${BREAK:-}" = "1" ]; then
  step "BREAK: the same file, run instead of folded"
  reconcile run dry-run "$POLICY" > /dev/null
  [ -e "$MARKER" ] && caught run-performs-it "marker present after --config-mode run: the run path did what the fold never does, so step 3's check is load-bearing" || fail run-performs-it "the run path wrote no marker, so step 3 checked nothing"
fi
