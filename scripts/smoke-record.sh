#!/usr/bin/env bash
# Run every claim twice, plain and with BREAK=1, and write the record the
# evidence page renders (#146): one row per claim with both verdicts, the
# commit and the date. The weekly demo workflow commits the result.
#
#   scripts/smoke-record.sh docs/data/smoke.json
set -uo pipefail
out="${1:?output path}"
root="$(cd "$(dirname "$0")/.." && pwd)"
rows=""
for s in "$root"/scripts/smoke/scenarios/*.sh; do
  name="$(basename "$s" .sh)"
  title="$(sed -n '2s/^# //p' "$s")"
  if bash "$root/scripts/smoke.sh" "$name" > "$root/smoke-$name.log" 2>&1; then plain=pass; else plain=fail; fi
  if BREAK=1 bash "$root/scripts/smoke.sh" "$name" > "$root/smoke-$name-break.log" 2>&1; then broken=caught; else broken=missed; fi
  echo "$name: $plain, BREAK=1 $broken"
  rows="$rows{\"claim\":\"$name\",\"title\":$(node -pe 'JSON.stringify(process.argv[1])' "$title"),\"command\":\"just smoke $name\",\"verdict\":\"$plain\",\"break\":\"$broken\"},"
done
cat > "$out" <<JSON
{
  "_comment": "Written by scripts/smoke-record.sh from the weekly demo workflow; one row per claim under scripts/smoke/scenarios/. verdict is the plain run, break the BREAK=1 run, which must be caught.",
  "commit": "$(git -C "$root" rev-parse --short HEAD)",
  "date": "$(date -u +%Y-%m-%d)",
  "warden": "$(sed -n 's/^  WARDEN_REF: \([0-9a-f]\{8\}\).*/\1/p' "$root/.github/workflows/demo.yml")",
  "claims": [${rows%,}]
}
JSON
echo "wrote $out"
grep -q '"verdict":"fail"\|"break":"missed"' "$out" && exit 1 || exit 0
