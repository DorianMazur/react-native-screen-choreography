# Performance measurements

The performance suite measures a gallery card-to-detail round trip using the
example's bundled photos, shared `GalleryImage` component, theme, and gallery
transition recipes. The selected card pairs its frame, photo, camera glyph,
title, and location. The grid remains mounted behind the detail screen.

Both variants use the same five pairs and assets. Ordinary mode renders photo
content in the screens and overlay; live mode retains a single photo owner.
The surrounding frame and text transitions are the same in both. The fixture
waits for the selected image to load before declaring readiness.

This is a controlled gallery workload, not a benchmark of every demo feature:
there is no lightbox, sharing, scrolling gesture, or interactive cancellation in
the measured journey. It does not establish video or text-input continuity.
Gallery reports use fixture version 2. Version 1 synthetic-panel exports are
rejected because their workload is not comparable.

## Run locally

Use the repository's Node version from `.nvmrc`, its pinned Yarn version, and
install dependencies from the repository root:

```sh
yarn install --immutable
yarn test:performance
```

`test:performance` validates collectors, parsers, the profiling resolver, and PR
comment handling. Run `yarn typecheck` to check the TypeScript scripts and tests
as well as the library. The Metro resolver stays CommonJS so Metro can load it
without a TypeScript loader. The test command does not run a native app or collect device measurements.

The native commands build and run the benchmark example, collect artifacts, and
generate a report:

```sh
yarn perf:android native-release
yarn perf:android react-profile

yarn perf:ios native-release
yarn perf:ios react-profile
```

Omitting the mode selects `native-release`. Neither mode requires a running
Metro server; both build bundled JavaScript.

| Mode             | Purpose                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `native-release` | Normal production React renderer; native frame or elapsed-time, memory, lifecycle, and input observations. |
| `react-profile`  | Production profiling renderer with React `Profiler` observations enabled. Development mode remains disabled.       |

Compare ordinary and live measurements within the same mode, device, runtime,
and dependency versions. **Do not compare elapsed timings across these modes.**
Profiling adds work of its own. A requested profiling run fails validation if
the renderer produces no timing observations; missing durations are not zeros.

### Android requirements and options

Install JDK 17 and the Android SDK, set `ANDROID_HOME` or `ANDROID_SDK_ROOT`, and
connect exactly one booted device or emulator. Use Android API 31 or newer for
the required frame-overrun and memory data. The runner builds the example's
non-debuggable `benchmark` app variant and its Macrobenchmark test package.
Use a device reserved for the run and keep animations enabled.

| Variable                    | Default                                                | Meaning                                                                            |
| --------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `PERFORMANCE_ITERATIONS`    | `3`                                                   | Frame measurement iterations; integer from 1 to 100.                   |
| `PERFORMANCE_MEMORY_CYCLES` | `3`                                                   | Repeated navigation cycles for memory and input collection; integer from 1 to 100. |
| `PERFORMANCE_ABI`           | Connected device ABI                                   | ABI compiled for the run, such as `arm64-v8a` or `x86_64`.                         |
| `PERFORMANCE_OUTPUT`        | A timestamped directory under `artifacts/performance/` | New output directory; it must not already exist.                                   |

Local Android runs and CI default to three repetitions per case. These
short runs are useful for checking collection and spotting large changes. Use
more repetitions for performance comparisons:

```sh
PERFORMANCE_ITERATIONS=20 PERFORMANCE_MEMORY_CYCLES=20 \
  PERFORMANCE_OUTPUT=artifacts/performance/android-comparison-01 \
  yarn perf:android native-release
```

The runner detects an emulator and suppresses only Macrobenchmark's `EMULATOR`
warning. Other benchmark validity checks remain enabled. It clears this
example's old device benchmark exports and host-side additional-test outputs
before collection so stale samples cannot make a failed run appear successful.

Android runs four test cases: transition frames and repeated navigation
memory/input for ordinary and live rendering. Startup measurements are omitted.
Frame tests still start a fresh Activity before each measured round trip; launch
and settling are outside the measured interval. Native compilation and installation
still take their usual time, especially on the first run.

### Optional local iOS measurements

Use macOS with Xcode 26, its command-line tools and an installed iPhone simulator
runtime. Install Ruby and Bundler compatible with
`examples/react-navigation/Gemfile.lock`, then install the locked Pods:

```sh
cd examples/react-navigation
bundle install
bundle exec pod install --deployment --project-directory=ios
cd ../..
```

The committed Pod lockfile builds React Native core and its C++ dependencies
from source while using prebuilt Hermes. Leave `RCT_USE_RN_DEP` and
`RCT_USE_PREBUILT_RNCORE` unset for this installation; enabling their prebuilt
alternatives changes the dependency graph and is incompatible with this lock.

The dependency installation must succeed before running the benchmarks. If a
locked native artifact such as Hermes cannot be downloaded, preserve the error
and retry when that artifact is available. Do not silently switch engine
versions or fall back to an unpinned source build to obtain a timing result.

Boot one iPhone simulator, or select a booted simulator explicitly:

```sh
PERFORMANCE_IOS_DEVICE=YOUR_SIMULATOR_UDID \
  PERFORMANCE_OUTPUT=artifacts/performance/ios-comparison-01 \
  yarn perf:ios native-release
```

Without `PERFORMANCE_IOS_DEVICE`, exactly one available simulator must be booted.
`PERFORMANCE_OUTPUT` follows the same fresh-directory rule as Android. The
runner uses separate build directories for native and profiling modes.

The native XCTest cases record three iterations per metric. XCTest also executes
and discards a first iteration; round-trip tests explicitly warm the fixture
before the measured loop. The profiling cases collect an acknowledged round
trip without native XCTest performance measurements. Android iteration variables
do not change these iOS counts.

`yarn perf:ios` targets simulators and disables code signing. For a signed
physical-device XCTest run, use the underlying scheme with your device and
signing configuration:

```sh
xcodebuild test \
  -workspace examples/react-navigation/ios/ScreenChoreographyExample.xcworkspace \
  -scheme ScreenChoreographyPerformance -configuration Release \
  -destination 'platform=iOS,id=YOUR_DEVICE_UDID' \
  -resultBundlePath artifacts/performance/ios-device.xcresult
```

Use a fresh result path and configure signing for the app and UI test target.
For profiling, set `CHOREOGRAPHY_REACT_PROFILE=1` in the environment and pass
`PERFORMANCE_REACT_PROFILE=1` to `xcodebuild`; keep a separate derived-data directory.
The app exports JSON to `Documents/choreography-benchmarks/` in its data container,
which must be collected alongside the `.xcresult` bundle for a manual run.

## What the measurements mean

| Measurement                                             | Definition and limitation                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `requestToSessionActiveMs`                              | JavaScript request to the provider's session-active callback. A preparation proxy; not the first presented moving frame.                                                                                                                               |
| `sessionActiveToEndMs`, `requestToSessionEndMs`         | Intervals between JavaScript lifecycle observations. Scheduling and callback delays are included.                                                                                                                                                      |
| `requestToProbeHandlerMs`, `sessionEndToProbeHandlerMs` | A real native test tap reaching the destination's JavaScript handler. Tests wait before tapping, so these are observed upper bounds on usable input, not the earliest possible readiness time.                                                         |
| Android `touchToAcknowledgementMs`                      | Native event time to the matching native acknowledgment called by the JavaScript probe. Includes event dispatch and JavaScript/native queue work.                                                                                                      |
| React render work and committed updates                 | `Profiler` `actualDuration` observations and their count, from the profiling renderer. Render work is not native Fabric commit duration.                                                                                                               |
| Payload mounts and unmounts                             | Instrumented React payload lifecycle. A live run requires one owner mount and no owner unmount during its journeys. This does not establish native video/focus continuity.                                                                             |
| Android frame timing                                    | Macrobenchmark `FrameTimingMetric` samples and Perfetto traces from the scripted forward/back round trip, including probe and status updates. `frameOverrunMs` is time past a platform frame deadline; negative means it finished before the deadline. |
| Android `deadlineOverrunPercent`                        | Percentage of captured frame samples with positive overrun. It is not a count of skipped display refreshes.                                                                                                                                            |
| iOS `roundTripSeconds`                                  | XCTest clock time for opening, acknowledging a real detail tap, returning, and acknowledging a real list tap. Includes automation and observation overhead.                                                                                            |
| iOS physical memory                                     | XCTest application peak physical memory and memory change during that round trip. The report preserves XCTest's declared memory units and allows negative changes.                                                                                     |
| Android PSS/RSS                                         | Process memory checkpoints at baseline, detail, and after returning. The sampled maximum can miss a peak between checkpoints.                                                                                                                          |

On Android, JavaScript lifecycle and probe telemetry is collected separately
from the native frame window through the repeated memory/input fixture. Do not
treat its probe timestamps as frame-by-frame observations of the Macrobenchmark
trace. Report serialization and file export happen outside measured transition
windows. On iOS, fixture resets and exports are outside the XCTest clock/memory
intervals.

There is no iOS dropped-frame count in this suite. There is also no measurement
of native Fabric commit duration or precise first-motion presentation latency.
Those need additional native instrumentation or Instruments analysis.

Memory after returning includes caches and retained application state. A positive
delta does not prove a leak; a flat sampled delta does not prove that transient
allocations were cheap. Idle reclamation, longer navigation histories, and native
resource lifetimes require separate investigation.

## Reports and comparisons

Each run writes `report/summary.md`, `report/summary.json`, raw measurements,
device metadata, and build/test logs under its output directory. Android retains
Macrobenchmark results, Perfetto traces, and memory dumps. iOS retains the
`.xcresult` bundle, exported native metrics, and fixture JSON.

Summaries show sample count, median, minimum, maximum, and P95 only when at least
20 samples are available. Frame samples within a transition are correlated;
many frame samples do not replace repeated independent runs. Inspect raw traces
when a distribution changes, and repeat on the same physical device before
making a product performance claim.

Collection fails for missing required measurements, unsuccessful journeys,
unacknowledged input, lost telemetry, duplicate run IDs, invalid units, or a
profiling-mode mismatch. iOS native-release collection requires ordinary and live
round-trip clock and peak-memory coverage. Numerical performance values
are informational: the suite does not impose an automatic percentage-regression
threshold or compute a controlled comparison against the base branch.

Hosted emulator and simulator results are diagnostics. Keep them separate from
physical-device measurements and avoid treating cross-run host load, OS changes,
or different build modes as library regressions.

## CI and pull-request comments

Performance CI runs only on Android. The regular iOS build remains in the main
CI workflow. Check iOS transitions locally after native iOS changes and before
releases; Android measurements cannot detect iOS-specific rendering regressions.
The optional `perf:ios` command remains available for local investigation.

The [Performance workflow](../.github/workflows/performance.yml) runs collector
tests and Android jobs for each build mode on pull requests to
`main`, pushes to `main`, and manual dispatch. Job summaries expose collection
results. Compact summaries are retained for 30 days; raw artifacts and traces
are retained for 7 days.

The [comment workflow](../.github/workflows/performance-comment.yml) creates or
updates one performance comment for the current open PR head after collection
finishes. It shows selected measurements, flags failed or missing collection,
and links to the run's complete artifacts. Results for an older PR head do not
replace current-head results.

**The comment workflow and its trusted `post-comment.mts` script must first be
merged into the repository's default branch.** GitHub's `workflow_run` publisher
uses that trusted branch, so adding the files in a new PR alone does not activate
comments for that PR. Subsequent PR runs can update comments once the publisher
is present and Actions has the required permissions.

Benchmark jobs have read-only repository permissions. The separate publisher
reads bounded summary JSON; it does not execute PR-provided code with its
comment-writing token. Fork PR execution may still require a maintainer's
approval under the repository's Actions settings.

## Fixture implementation

The fixture uses bundled gallery images and five shared pairs with 350 ms transitions. The source route
stays mounted and unfrozen. Forward navigation uses `useChoreographyNavigation`;
back uses `useInteractiveTransition().beginBack()` and `finish({ duration: 350 })`.
A ten-second timeout records failure. Native launch props select
`performanceScenario: "ordinary" | "live"` and `performanceReactProfile`.

### Native automation protocol

All control names below are both `testID` and `accessibilityLabel` values. Probe
controls are inside the real destination screen, outside the overlay. Tests must
inject native touches; invoking their JS handlers directly is not a valid test.

1. Wait for `benchmark-ready` after the selected image loads and two JS animation frames.
   On Android, this also waits for the native fully-drawn acknowledgment so the
   fixture is drawn before frame collection starts.
2. Tap `benchmark-start`.
3. Wait for `benchmark-detail-settled`, then tap `benchmark-detail-probe`.
4. Wait for `benchmark-detail-probe-ack`.
5. Tap `benchmark-back`.
6. Wait for `benchmark-list-settled`, then tap `benchmark-list-probe`.
7. Wait for `benchmark-list-probe-ack`.
8. Tap `benchmark-end`, then wait for `benchmark-export-complete` (also aliased as
   `benchmark-exported`). The marker appears after native export resolves.

For another cycle, capture `benchmark-run-id` (iOS identifier/accessibility value;
Android content description `benchmark-run-id:<runId>`),
tap `benchmark-reset`, wait for a changed run ID, then wait for `benchmark-ready`.
Reset exports any measured, unexported run before replacing its collector. A reset
during an unfinished request preserves an explicit failure. Initial resets with
no navigation requests do not export an empty run. Export failure keeps the
collector intact and exposes `benchmark-failed`.

### Native module contract

`NativeModules.ChoreographyBenchmark` may implement:

- `finishRun(json: string): Promise<string>`: persist the complete report and
  resolve with its location. This is the preferred export path.
- `recordSample(json: string): void`: fallback sink receiving one complete run
  envelope if `finishRun` is unavailable. It has no durable-write acknowledgment.
- `acknowledgeInput(screen: "detail" | "list"): void`: invoked immediately inside
  the actual probe handler. Any native touch/receipt timestamps remain in their
  own clock domain.
- `reportFullyDrawn(): Promise<void>`: Android reports app-defined TTFD during a
  native draw and resolves after draw dispatch. The fixture publishes readiness
  only after resolution. Repeat calls resolve without reporting again for the
  same Activity.

The fixture buffers bounded samples in memory during navigation and exports them
afterward, keeping bridge export traffic outside measured transitions.
