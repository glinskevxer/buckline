#!/usr/bin/env bash
# A run through the commands against real files, checking the output rather
# than the exit code. A command that prints nothing and exits zero has passed
# every test we could write against its exit status and is still broken.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

CLI="node $HERE/bin/buckline.js"

cat > "$WORK/tract.json" <<'JSON'
{
  "id": "T-7",
  "name": "Culpeper 40",
  "owner": "E. Whitlock",
  "contract": { "rule": "doyle", "sweepAllowance": "quarter" }
}
JSON

cat > "$WORK/load.json" <<'JSON'
{
  "id": "LD-19",
  "tractId": "T-7",
  "scaledBy": "D. Rakes",
  "logs": [
    { "id": "L-1", "species": "red oak", "axesIn": [17.4, 17.4], "measuredLengthFt": 16.25 },
    { "id": "L-2", "species": "white oak", "axesIn": [21.8, 21.8], "measuredLengthFt": 12.25 }
  ]
}
JSON

cat > "$WORK/stem.json" <<'JSON'
{
  "id": "S-1",
  "species": "red oak",
  "profile": [
    { "atFt": 0, "diameterIn": 26 },
    { "atFt": 4, "diameterIn": 22 },
    { "atFt": 20, "diameterIn": 18 },
    { "atFt": 40, "diameterIn": 12 }
  ],
  "defects": [{ "type": "catface", "atFt": 24, "lengthFt": 2 }]
}
JSON

cat > "$WORK/prices.json" <<'JSON'
{ "id": "PL-1", "effectiveFrom": "2024-01-01", "base": { "red oak": 1400 } }
JSON

expect_contains() {
  local haystack="$1" needle="$2" what="$3"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "smoke: $what did not mention '$needle'" >&2
    echo "$haystack" >&2
    exit 1
  fi
  echo "smoke: $what ok"
}

OUT="$($CLI --version)"
expect_contains "$OUT" "." "version"

OUT="$($CLI rules --rule doyle --from 16 --to 16)"
expect_contains "$OUT" "144" "doyle scale stick"

OUT="$($CLI rules --length 16 --from 16 --to 16)"
expect_contains "$OUT" "180" "rule comparison"

OUT="$($CLI scale -l "$WORK/load.json" -t "$WORK/tract.json")"
expect_contains "$OUT" "Scale ticket" "scale"
expect_contains "$OUT" "Doyle" "scale names the rule"

OUT="$($CLI buck -s "$WORK/stem.json" -p "$WORK/prices.json" -r doyle --top 12)"
expect_contains "$OUT" "Cutting card" "buck"

OUT="$($CLI yard tract -y "$WORK/book.jsonl" -i "$WORK/tract.json")"
expect_contains "$OUT" "saved tract T-7" "yard tract"

OUT="$($CLI yard receive -y "$WORK/book.jsonl" -i "$WORK/load.json")"
expect_contains "$OUT" "received load LD-19" "yard receive"

OUT="$($CLI yard scale -y "$WORK/book.jsonl" -l LD-19)"
expect_contains "$OUT" "Scale ticket" "yard scale"

OUT="$($CLI yard status -y "$WORK/book.jsonl")"
expect_contains "$OUT" "Yard book" "yard status"

set +e
$CLI scale -l "$WORK/missing.json" -t "$WORK/tract.json" >/dev/null 2>&1
CODE=$?
set -e
if [ "$CODE" -ne 4 ]; then
  echo "smoke: a missing file should exit 4, got $CODE" >&2
  exit 1
fi
echo "smoke: missing file exit code ok"

OUT="$($CLI doctor)"
expect_contains "$OUT" "nothing to report" "doctor"

echo "smoke: all good"
