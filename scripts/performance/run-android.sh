#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
mode="${1:-native-release}"
[[ "$mode" == native-release ]] || { echo "Only native-release is supported." >&2; exit 2; }

if [[ -n "${ANDROID_HOME:-}" ]]; then export PATH="$ANDROID_HOME/platform-tools:$PATH"; fi
if [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then export PATH="$ANDROID_SDK_ROOT/platform-tools:$PATH"; fi
command -v adb >/dev/null || { echo 'Install Android SDK platform-tools and set ANDROID_HOME.' >&2; exit 2; }
adb get-state >/dev/null
cycles="${PERFORMANCE_TIMING_CYCLES:-20}"
[[ "$cycles" =~ ^[1-9][0-9]*$ ]] || { echo 'Cycle counts must be positive integers.' >&2; exit 2; }
[[ "$cycles" -le 100 ]] || { echo 'Cycle counts must not exceed 100.' >&2; exit 2; }
abi="${PERFORMANCE_ABI:-$(adb shell getprop ro.product.cpu.abi | tr -d '\r')}"
emulator="$(adb shell getprop ro.kernel.qemu | tr -d '\r')"
output="${PERFORMANCE_OUTPUT:-$repo_root/artifacts/performance/android-$mode-$(date -u +%Y%m%dT%H%M%SZ)}"
[[ ! -e "$output" ]] || { echo "Use a fresh PERFORMANCE_OUTPUT directory: $output" >&2; exit 2; }
mkdir -p "$output/raw" "$output/report"
output="$(cd "$output" && pwd)"
printf 'Results: %s\n' "$output"
printf 'Running %s forward/back timing and input cycles.\n' "$cycles"

export PERFORMANCE_DEVICE_MODEL="$(adb shell getprop ro.product.model | tr -d '\r')"
export PERFORMANCE_OS_VERSION="$(adb shell getprop ro.build.version.release | tr -d '\r')"
export PERFORMANCE_API_LEVEL="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
export PERFORMANCE_IS_EMULATOR="$emulator"
node - "$output/metadata.json" "$abi" "$cycles" <<'NODE'
const fs = require('node:fs');
fs.writeFileSync(process.argv[2], JSON.stringify({
  deviceModel: process.env.PERFORMANCE_DEVICE_MODEL,
  osVersion: process.env.PERFORMANCE_OS_VERSION,
  apiLevel: Number(process.env.PERFORMANCE_API_LEVEL),
  emulator: process.env.PERFORMANCE_IS_EMULATOR === '1',
  nodeVersion: process.version,
  runnerImage: process.env.ImageVersion ?? 'local',
  reactNativeVersion: require('./examples/react-navigation/node_modules/react-native/package.json').version,
  reanimatedVersion: require('./examples/react-navigation/node_modules/react-native-reanimated/package.json').version,
  abi: process.argv[3], timingCycles: Number(process.argv[4]),
}, null, 2));
NODE

arguments=(
  :macrobenchmark:connectedBenchmarkAndroidTest
  --no-daemon --console=plain
  "-PreactNativeArchitectures=$abi"
  "-Pandroid.testInstrumentationRunnerArguments.performanceTimingCycles=$cycles"
)
# These directories contain only this example's previous benchmark exports.
# Clear them so stale data cannot make a failed collection appear successful.
adb shell rm -rf /sdcard/Android/data/screenchoreography.example/files/performance
adb shell rm -rf /sdcard/Android/data/screenchoreography.example.macrobenchmark/files/performance
native_outputs=examples/react-navigation/android/macrobenchmark/build/outputs/connected_android_test_additional_output
rm -rf "$native_outputs"
status=0
(cd examples/react-navigation/android && ./gradlew "${arguments[@]}") > >(tee "$output/gradle.log") 2>&1 || status=$?

# Instrumentation copies fixture data into AGP's output before test APK
# cleanup. Collect that single source even on failure; do not double-count it
# through an additional post-test pull from a surviving app installation.
if [[ -d "$native_outputs" ]]; then cp -R "$native_outputs" "$output/raw/macrobenchmark"; fi
adb logcat -d -t 2000 > "$output/logcat.txt" || true
node --experimental-transform-types scripts/performance/report.mts --platform=android "--mode=$mode" "--input=$output/raw" "--output=$output/report" "--metadata=$output/metadata.json" || status=1
printf 'Report: %s/report/summary.md\n' "$output"
exit "$status"
