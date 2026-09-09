#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
mode="${1:-native-release}"
case "$mode" in
  native-release) export CHOREOGRAPHY_REACT_PROFILE=0; profile=0 ;;
  react-profile) export CHOREOGRAPHY_REACT_PROFILE=1; profile=1 ;;
  *) echo 'Usage: yarn perf:ios [native-release|react-profile]' >&2; exit 2 ;;
esac
command -v xcodebuild >/dev/null || { echo 'Xcode is required.' >&2; exit 2; }
device="${PERFORMANCE_IOS_DEVICE:-}"
if [[ -z "$device" ]]; then
  device="$(xcrun simctl list devices booted --json | node -e '
    let input=""; process.stdin.on("data",chunk=>input+=chunk); process.stdin.on("end",()=>{
      const devices=Object.values(JSON.parse(input).devices).flat().filter(d=>d.state==="Booted" && d.isAvailable);
      if(devices.length!==1){console.error("Set PERFORMANCE_IOS_DEVICE to one simulator UDID, or boot exactly one simulator.");process.exit(2)}
      process.stdout.write(devices[0].udid);
    });')"
fi
output="${PERFORMANCE_OUTPUT:-$repo_root/artifacts/performance/ios-$mode-$(date -u +%Y%m%dT%H%M%SZ)}"
[[ ! -e "$output" ]] || { echo "Use a fresh PERFORMANCE_OUTPUT directory: $output" >&2; exit 2; }
mkdir -p "$output/raw" "$output/report"
output="$(cd "$output" && pwd)"
printf 'Results: %s\n' "$output"

if [[ ! -f examples/react-navigation/ios/Pods/Manifest.lock ]]; then
  echo 'Install native dependencies first: cd examples/react-navigation && bundle install && bundle exec pod install --project-directory=ios' >&2
  exit 2
fi
data_container="$(xcrun simctl get_app_container "$device" screenchoreography.example data 2>/dev/null || true)"
if [[ -n "$data_container" ]]; then rm -rf "$data_container/Documents/choreography-benchmarks"; fi
xcrun simctl list devices --json > "$output/devices.json"
node - "$output/metadata.json" "$device" <<'NODE'
require('node:fs').writeFileSync(process.argv[2], JSON.stringify({ simulator: true, deviceId: process.argv[3] }, null, 2));
NODE

status=0
xcodebuild test \
  -workspace examples/react-navigation/ios/ScreenChoreographyExample.xcworkspace \
  -scheme ScreenChoreographyPerformance -configuration Release \
  -destination "platform=iOS Simulator,id=$device" \
  -derivedDataPath "$repo_root/artifacts/performance/ios-derived-$mode" \
  -resultBundlePath "$output/Performance.xcresult" \
  "PERFORMANCE_REACT_PROFILE=$profile" CODE_SIGNING_ALLOWED=NO \
  > >(tee "$output/xcodebuild.log") 2>&1 || status=$?

data_container="$(xcrun simctl get_app_container "$device" screenchoreography.example data 2>/dev/null || true)"
if [[ -n "$data_container" && -d "$data_container/Documents/choreography-benchmarks" ]]; then
  cp -R "$data_container/Documents/choreography-benchmarks" "$output/raw/app"
fi
if [[ -d "$output/Performance.xcresult" ]]; then
  xcrun xcresulttool get test-results metrics --path "$output/Performance.xcresult" > "$output/raw/xctest-metrics.json" 2> "$output/xcresulttool.log" || status=1
fi
node --experimental-transform-types scripts/performance/report.mts --platform=ios "--mode=$mode" "--input=$output/raw" "--output=$output/report" "--metadata=$output/metadata.json" || status=1
printf 'Report: %s/report/summary.md\n' "$output"
exit "$status"
