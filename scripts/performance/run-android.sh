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
# Let the booted emulator settle before starting the benchmark suite.
sleep 10
cycles="${PERFORMANCE_TIMING_CYCLES:-20}"
[[ "$cycles" =~ ^[1-9][0-9]*$ && "$cycles" -le 99 ]] || { echo 'Use 1..99 measured round trips.' >&2; exit 2; }
abi="${PERFORMANCE_ABI:-$(adb shell getprop ro.product.cpu.abi | tr -d '\r')}"
output="${PERFORMANCE_OUTPUT:-$repo_root/artifacts/performance/android-$mode-$(date -u +%Y%m%dT%H%M%SZ)}"
[[ ! -e "$output" ]] || { echo "Use a fresh PERFORMANCE_OUTPUT directory: $output" >&2; exit 2; }
mkdir -p "$output/raw" "$output/report"
output="$(cd "$output" && pwd)"
printf 'Results: %s\n' "$output"
printf 'Per scenario: %s measured timing/input round trips.\n' "$cycles"

export PERFORMANCE_DEVICE_MODEL="$(adb shell getprop ro.product.model | tr -d '\r')"
export PERFORMANCE_OS_VERSION="$(adb shell getprop ro.build.version.release | tr -d '\r')"
export PERFORMANCE_API_LEVEL="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
export PERFORMANCE_IS_EMULATOR="$(adb shell getprop ro.kernel.qemu | tr -d '\r')"
export PERFORMANCE_SYSTEM_IMAGE="$(adb shell getprop ro.build.fingerprint | tr -d '\r')"
export PERFORMANCE_GRAPHICS_RENDERER="$(adb shell dumpsys SurfaceFlinger | sed -n 's/^[[:space:]]*GLES: //p' | tr -d '\r')"
export PERFORMANCE_EMULATOR_VERSION=''
if [[ "$PERFORMANCE_IS_EMULATOR" == 1 ]]; then
  # `emulator -version` loads the GUI binary, whose libraries may be absent on CI.
  PERFORMANCE_EMULATOR_VERSION="$(awk -F= '
    /^Pkg.Revision=/ { revision=$2 }
    /^Pkg.BuildId=/ { build=$2 }
    END {
      if (revision == "" || build == "") exit 1
      printf "%s (%s)", revision, build
    }
  ' "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}/emulator/source.properties")"
fi
node - "$output/metadata.json" "$abi" "$cycles" <<'NODE'
const fs = require('node:fs');
fs.writeFileSync(process.argv[2], JSON.stringify({
  deviceModel: process.env.PERFORMANCE_DEVICE_MODEL,
  osVersion: process.env.PERFORMANCE_OS_VERSION,
  apiLevel: Number(process.env.PERFORMANCE_API_LEVEL),
  emulator: process.env.PERFORMANCE_IS_EMULATOR === '1',
  emulatorVersion: process.env.PERFORMANCE_EMULATOR_VERSION,
  systemImage: process.env.PERFORMANCE_SYSTEM_IMAGE,
  graphicsRenderer: process.env.PERFORMANCE_GRAPHICS_RENDERER,
  nodeVersion: process.version,
  runnerImage: process.env.ImageVersion ?? 'local',
  reactNativeVersion: require('./examples/react-navigation/node_modules/react-native/package.json').version,
  reanimatedVersion: require('./examples/react-navigation/node_modules/react-native-reanimated/package.json').version,
  abi: process.argv[3], timingCycles: Number(process.argv[4]),
  hostCpu: require('node:os').cpus()[0]?.model,
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
native_results=examples/react-navigation/android/macrobenchmark/build/outputs/androidTest-results/connected/benchmark
rm -rf "$native_outputs"
status=0
(cd examples/react-navigation/android && ./gradlew "${arguments[@]}") > >(tee "$output/gradle.log") 2>&1 || status=$?

# Instrumentation copies fixture data into AGP's output before test APK
# cleanup. Collect that single source even on failure; do not double-count it
# through an additional post-test pull from a surviving app installation.
if [[ -d "$native_outputs" ]]; then cp -R "$native_outputs" "$output/raw/macrobenchmark"; fi
# Keep per-test logs and stack traces; the final logcat tail can miss an earlier scenario's crash.
if [[ -d "$native_results" ]]; then cp -R "$native_results" "$output/test-results"; fi
adb logcat -d -t 2000 > "$output/logcat.txt" || true
node --experimental-transform-types scripts/performance/report.mts --platform=android "--mode=$mode" "--input=$output/raw" "--output=$output/report" "--metadata=$output/metadata.json" || status=1
printf 'Report: %s/report/summary.md\n' "$output"
exit "$status"
