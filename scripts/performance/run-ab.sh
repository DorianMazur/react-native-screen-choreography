#!/usr/bin/env bash
# Measures base and current library sources alternately on one device, so a
# difference is not an artifact of separate hosts or sessions.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
platform="${1:-}"
mode="${2:-native-release}"
[[ "$platform" == ios || "$platform" == android ]] || { echo 'Usage: run-ab.sh <ios|android> [native-release]' >&2; exit 2; }
rounds="${PERFORMANCE_AB_ROUNDS:-2}"
[[ "$rounds" =~ ^[1-9]$ ]] || { echo 'PERFORMANCE_AB_ROUNDS must be in 1..9.' >&2; exit 2; }
base="$(git rev-parse --verify --quiet "${PERFORMANCE_AB_BASE:-}^{commit}")" || { echo 'Set PERFORMANCE_AB_BASE to the base commit.' >&2; exit 2; }
# Only library sources change sides. The fixture, example and dependencies stay
# current, so both sides are measured by the same instrument.
library=(src cpp ios android)
[[ -z "$(git status --porcelain -- "${library[@]}")" ]] || { echo 'Commit or stash library changes first; sides are swapped with git restore.' >&2; exit 2; }
output="${PERFORMANCE_OUTPUT:-$repo_root/artifacts/performance/$platform-$mode-ab-$(date -u +%Y%m%dT%H%M%SZ)}"
[[ ! -e "$output" ]] || { echo "Use a fresh PERFORMANCE_OUTPUT directory: $output" >&2; exit 2; }

if git diff --quiet "$base" HEAD -- "${library[@]}"; then
  echo 'Library sources match the base; measuring once without an A/B comparison.'
  PERFORMANCE_OUTPUT="$output" exec bash "scripts/performance/run-$platform.sh" "$mode"
fi

mkdir -p "$output"
output="$(cd "$output" && pwd)"
# Each side is pooled over all rounds, so every run measures a share of the cycles.
export PERFORMANCE_SCREEN_TIMING_CYCLES="${PERFORMANCE_AB_SCREEN_TIMING_CYCLES:-10}"
export PERFORMANCE_TRAY_TIMING_CYCLES="${PERFORMANCE_AB_TRAY_TIMING_CYCLES:-3}"

# Each side's sources are fixed for the whole run, so iOS builds a side once
# and later rounds reuse its products. Never reuse products from another run.
side_products="$repo_root/examples/react-navigation/ios/build/performance-ab"
rm -rf "$side_products"

# Staging keeps the index in step, so files that exist on one side only are
# removed again when the other side is restored.
use() { git restore --source="$1" --staged --worktree -- "${library[@]}"; }
trap 'use HEAD' EXIT

head_status=0
base_failed=0
for ((round = 1; round <= rounds; round++)); do
  # Alternate which side runs first so warm-up and drift do not favor one.
  if ((round % 2)); then sides=(base head); else sides=(head base); fi
  for side in "${sides[@]}"; do
    if [[ "$side" == base ]]; then
      if ((base_failed)); then continue; fi
      use "$base"
    else
      use HEAD
    fi
    printf '\nA/B round %s of %s: %s sources\n' "$round" "$rounds" "$side"
    status=0
    PERFORMANCE_OUTPUT="$output/$side-$round" PERFORMANCE_IOS_PRODUCTS="$side_products/$side" \
      bash "scripts/performance/run-$platform.sh" "$mode" || status=$?
    if [[ "$status" -ne 0 ]]; then
      # The current fixture may not build or validate against older sources.
      # That removes the comparison; it is not a failure of this change.
      if [[ "$side" == base ]]; then base_failed=1; else head_status="$status"; fi
    fi
  done
done
use HEAD

node --experimental-transform-types scripts/performance/ab.mts "--platform=$platform" "--mode=$mode" "--input=$output" "--output=$output/report" "--rounds=$rounds" "--base=$base" || {
  if [[ "$head_status" -eq 0 ]]; then head_status=1; fi
}
printf 'Report: %s/report/summary.md\n' "$output"
exit "$head_status"
