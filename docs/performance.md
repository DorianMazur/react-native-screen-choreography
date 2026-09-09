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

## Measurements and comparisons

The main summary has eight rows: four measurements for ordinary and live rendering.

| Measurement | Meaning |
| --- | --- |
| Frames over deadline (%) | Fraction of captured frames that miss their platform deadline during the round trip. |
| Open preparation (ms) | Request until the forward session becomes active in JavaScript; not first visible motion. |
| Return preparation (ms) | The same preparation interval for the backward journey. |
| Retained memory (MiB) | Final after-back process PSS minus the first baseline. Includes caches; a positive value does not prove a leak. |

React profiling has a separate, collapsed table showing render work per fixture
run. It is not native commit time and must not be compared with release timings.
Input acknowledgments, complete forward/back journeys, and payload lifecycle
remain validity checks. Redundant duration, probe-latency, per-checkpoint memory,
frame-duration, and mount-count distributions are no longer generated. Raw
fixture exports, memory dumps, and Perfetto traces remain available for debugging.

Each run saves `report/summary.md`, `report/summary.json`, raw data, and logs.
The PR comment shows **Base | PR / current | Change**. Changes are absolute:
percentage points for frames, milliseconds for preparation, and MiB for memory.
This handles zero baselines and negative memory retention without misleading
percentage changes. Values are medians; fewer frames over deadline and lower
preparation times are preferable, but memory deltas require interpretation.

The publisher looks for a successful push run of the Performance workflow on
the PR's actual base branch (`main` or `master`) at the exact base commit. It
compares only matching fixture/measurement versions, build modes, device/API/ABI,
iteration and memory-cycle counts, React Native/Reanimated/Node versions, and
runner image versions. Missing, expired, invalid, or incompatible base artifacts
produce “No compatible baseline”; they never become zeros. Local reports have
no baseline lookup. Existing reports lack the new comparison metadata, so the
first usable baseline requires a new base-branch run after these changes land.

Three repetitions on hosted emulators give noisy diagnostics, not a performance
guarantee. No automatic regression threshold is applied. Repeat on a physical
device before making performance claims. Collection still fails for missing
measurements, failed journeys, unacknowledged input, lost samples, invalid units,
or a profiling-mode mismatch.

## CI and pull-request comments

Performance CI runs only on Android. The regular iOS build remains in the main
CI workflow. Check iOS transitions locally after native iOS changes and before
releases; Android measurements cannot detect iOS-specific rendering regressions.

The [Performance workflow](../.github/workflows/performance.yml) runs collector
tests and Android jobs for each build mode on pull requests to
`main`, pushes to `main`, and manual dispatch. Job summaries expose collection
results. Compact summaries are retained for 30 days; raw artifacts and traces
are retained for 7 days.

The [comment workflow](../.github/workflows/performance-comment.yml) creates or
updates one performance comment for the current open PR head after collection
finishes, regardless of the size of the change.
The visible comment shows collection status and the run link; release comparisons
and React profiling tables are collapsed. It also posts when the baseline is
unavailable or collection failed. Subsequent runs edit the existing bot comment;
an identical body is left untouched. Results for an older PR head do not
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

For another cycle, capture `benchmark-run-id` (Android content description
`benchmark-run-id:<runId>`),
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
