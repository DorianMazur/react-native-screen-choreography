#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
mode="${1:-native-release}"
[[ "$mode" == native-release ]] || { echo 'Only native-release is supported.' >&2; exit 2; }
cycles="${PERFORMANCE_TIMING_CYCLES:-20}"
[[ "$cycles" =~ ^[1-9][0-9]*$ && "$cycles" -le 99 ]] || { echo 'Use 1..99 measured cycles plus the first round trip.' >&2; exit 2; }
# RN configures CCACHE_BINARY as an Xcode build setting, but compiler processes
# need it in their environment; otherwise RN's wrappers silently call clang alone.
if [[ "${USE_CCACHE:-0}" == 1 ]]; then
  CCACHE_BINARY="$(command -v ccache)" || { echo 'USE_CCACHE=1 requires ccache on PATH.' >&2; exit 2; }
  export CCACHE_BINARY
fi
output="${PERFORMANCE_OUTPUT:-$repo_root/artifacts/performance/ios-$mode-$(date -u +%Y%m%dT%H%M%SZ)}"
[[ ! -e "$output" ]] || { echo "Use a fresh PERFORMANCE_OUTPUT directory: $output" >&2; exit 2; }
cmp -s examples/react-navigation/ios/Podfile.lock examples/react-navigation/ios/Pods/Manifest.lock || {
  echo 'Install matching example pods before benchmarking: cd examples/react-navigation && bundle exec pod install --project-directory=ios' >&2
  exit 2
}
mkdir -p "$output/raw" "$output/report"
output="$(cd "$output" && pwd)"

# Own a fresh simulator, so neither existing app data nor another run is touched.
runtime="${PERFORMANCE_IOS_RUNTIME:-com.apple.CoreSimulator.SimRuntime.iOS-26-2}"
device_type="${PERFORMANCE_IOS_DEVICE_TYPE:-com.apple.CoreSimulator.SimDeviceType.iPhone-16}"
udid="$(xcrun simctl create ChoreographyPerformance "$device_type" "$runtime")"
cleanup() {
  xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true
  xcrun simctl delete "$udid" >/dev/null 2>&1 || true
}
trap cleanup EXIT
xcrun simctl boot "$udid"
xcrun simctl bootstatus "$udid" -b
# Let the booted simulator settle before starting the benchmark suite.
sleep 10
xcrun simctl status_bar "$udid" override --time '9:41' --dataNetwork wifi --wifiMode active --wifiBars 3 --batteryState charged --batteryLevel 100

export PERFORMANCE_DEVICE_MODEL="$device_type"
export PERFORMANCE_OS_VERSION="$(xcrun simctl getenv "$udid" SIMULATOR_RUNTIME_VERSION)"
export PERFORMANCE_XCODE_VERSION="$(xcodebuild -version | tr '\n' ' ')"
node - "$output/metadata.json" "$(uname -m)" "$cycles" <<'NODE'
const fs = require('node:fs');
fs.writeFileSync(process.argv[2], JSON.stringify({
  deviceModel: process.env.PERFORMANCE_DEVICE_MODEL,
  osVersion: process.env.PERFORMANCE_OS_VERSION,
  apiLevel: 'not-applicable', emulator: true,
  xcodeVersion: process.env.PERFORMANCE_XCODE_VERSION,
  nodeVersion: process.version, runnerImage: process.env.ImageVersion ?? 'local',
  reactNativeVersion: require('./examples/react-navigation/node_modules/react-native/package.json').version,
  reanimatedVersion: require('./examples/react-navigation/node_modules/react-native-reanimated/package.json').version,
  abi: process.argv[3], timingCycles: Number(process.argv[4]),
  hostCpu: require('node:os').cpus()[0]?.model,
}, null, 2));
NODE

derived_data="${PERFORMANCE_DERIVED_DATA:-$repo_root/examples/react-navigation/ios/build/performance}"
# This directory belongs to this benchmark scheme. Keep native build products for
# incremental local runs, but remove old test manifests before creating a new one.
mkdir -p "$derived_data/Build/Products"
rm -f "$derived_data"/Build/Products/ChoreographyPerformance_*.xctestrun
status=0
xcodebuild build-for-testing \
  -showBuildTimingSummary \
  -workspace examples/react-navigation/ios/ScreenChoreographyExample.xcworkspace \
  -scheme ChoreographyPerformance -configuration Release \
  -destination "platform=iOS Simulator,id=$udid" \
  -derivedDataPath "$derived_data" CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES \
  > >(tee "$output/build.log") 2>&1 || status=$?
if [[ "$status" -eq 0 ]]; then
  # Pass the cycle count explicitly to XCTest, rather than assuming shell env is forwarded.
  test_run="$(python3 - "$derived_data/Build/Products" "$cycles" <<'PY'
import pathlib, plistlib, sys
files = list(pathlib.Path(sys.argv[1]).glob('ChoreographyPerformance_*.xctestrun'))
if len(files) != 1: raise SystemExit('Expected exactly one xctestrun')
path = files[0]
with path.open('rb') as f: settings = plistlib.load(f)
def visit(value):
    count = 0
    if isinstance(value, dict):
        if 'TestBundlePath' in value:
            value.setdefault('EnvironmentVariables', {})['PERFORMANCE_TIMING_CYCLES'] = sys.argv[2]
            count += 1
        for child in value.values(): count += visit(child)
    elif isinstance(value, list):
        for child in value: count += visit(child)
    return count
if visit(settings) != 1: raise SystemExit('Expected exactly one UI test bundle')
with path.open('wb') as f: plistlib.dump(settings, f)
print(path)
PY
)"
  xcodebuild test-without-building -xctestrun "$test_run" \
    -destination "platform=iOS Simulator,id=$udid" \
    -parallel-testing-enabled NO -maximum-concurrent-test-simulator-destinations 1 \
    -resultBundlePath "$output/tests.xcresult" \
    > >(tee "$output/tests.log") 2>&1 || status=$?
fi
container="$(xcrun simctl get_app_container "$udid" screenchoreography.example data 2>/dev/null || true)"
if [[ -n "$container" && -d "$container/Documents/performance" ]]; then
  cp -R "$container/Documents/performance/." "$output/raw/"
fi
node --experimental-transform-types scripts/performance/report.mts --platform=ios "--mode=$mode" "--input=$output/raw" "--output=$output/report" "--metadata=$output/metadata.json" || status=1
printf 'Report: %s/report/summary.md\n' "$output"
exit "$status"
