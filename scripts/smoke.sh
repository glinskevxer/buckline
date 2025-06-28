#!/usr/bin/env bash
# A run through the commands against real files, checking the output rather
# than the exit code. A command that prints nothing and exits zero has passed
# every test we could write against its exit status and is still broken.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

CLI="node $HERE/bin/buckline.js"

# The fixtures live in examples/ and are the same files the readme shows. A
# smoke test with its own copies is a smoke test that stops matching the
# documentation the first time either is edited.
EX="$HERE/examples"

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

OUT="$($CLI scale -l "$EX/load.json" -t "$EX/tract.json")"
expect_contains "$OUT" "Scale ticket" "scale"
expect_contains "$OUT" "Doyle" "scale names the rule"

OUT="$($CLI buck -s "$EX/stem.json" -p "$EX/prices.json" -r doyle --top 12)"
expect_contains "$OUT" "Cutting card" "buck"

OUT="$($CLI yard tract -y "$WORK/book.jsonl" -i "$EX/tract.json")"
expect_contains "$OUT" "saved tract T-7" "yard tract"

OUT="$($CLI yard receive -y "$WORK/book.jsonl" -i "$EX/load.json")"
expect_contains "$OUT" "received load LD-19" "yard receive"

OUT="$($CLI yard scale -y "$WORK/book.jsonl" -l LD-19)"
expect_contains "$OUT" "Scale ticket" "yard scale"

OUT="$($CLI yard status -y "$WORK/book.jsonl")"
expect_contains "$OUT" "Yard book" "yard status"

set +e
$CLI scale -l "$WORK/missing.json" -t "$EX/tract.json" >/dev/null 2>&1
CODE=$?
set -e
if [ "$CODE" -ne 4 ]; then
  echo "smoke: a missing file should exit 4, got $CODE" >&2
  exit 1
fi
echo "smoke: missing file exit code ok"

OUT="$($CLI doctor)"
expect_contains "$OUT" "nothing to report" "doctor"

OUT="$($CLI settle -g "$EX/graded.json" -t "$EX/terms.json")"
expect_contains "$OUT" "Settlement" "settle"

OUT="$($CLI kiln plan -u "$EX/units.json")"
expect_contains "$OUT" "What the kilns could run" "kiln plan"

OUT="$($CLI species)"
expect_contains "$OUT" "red oak" "species table"

echo "smoke: all good"
