# Performance measurements

The suite measures one real journey: **open Aurora in the Gallery example, then return to the list**. It uses the example's shared photo, gradient, icon, text, navigation, and animation—not a synthetic workload.

Use the reports to compare changes under the same conditions. Confirm findings before making performance claims.

## Read the report

Each run produces three main metrics. Lower is better.

| Metric                   | What it tells you                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Frames over deadline (%) | Share of captured frames that miss their platform deadline during the round trip.               |
| Open preparation (ms)    | Median time from the navigation request until the forward session becomes active in JavaScript. |
| Return preparation (ms)  | The same preparation interval for the return journey.                                           |

**Preparation is not time to first visible motion.** The suite does not measure app startup, scrolling, lightbox, sharing, or interactive cancellation. Memory is not collected.

Reports also verify complete forward/back journeys, input acknowledgments, and that the selected hero stays mounted. Missing measurements, lost samples, failed journeys, invalid units, or a profiling mismatch fail collection; missing values never become zeros. There is no automatic performance-regression threshold.

## Run locally

Use the Node version in `.nvmrc` and the repository's pinned Yarn version. You need **JDK 17**, the Android SDK with `ANDROID_HOME` or `ANDROID_SDK_ROOT` set, and **one booted Android device or emulator on API 31+**. Keep animations enabled and the device free of other work.

From the repository root:

```sh
yarn install --immutable
yarn perf:android native-release
```

The runner builds and installs the non-debuggable benchmark app and test package with bundled JavaScript. **No Metro server is needed.** The first native build can take a while.

| Mode                       | Use it for                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `native-release` (default) | Production frame and preparation measurements.                                                                 |
| `react-profile`            | Investigating React render work with the production profiling renderer. Run `yarn perf:android react-profile`. |

**Compare runs within the same mode.** Profiling adds overhead; React render durations are not native commit times and should not be compared with release timings. A profiling run without timing observations fails validation.

By default, each mode runs **20 frame-measurement round trips and 20 timing/input round trips**. Each preparation row gets 20 samples per direction; frame percentages aggregate captured frames. Activity launch and settling happen outside the measured interval.

Results go to a new timestamped folder under `artifacts/performance/`: start with **`report/summary.md`**. The folder also contains `summary.json` under `report/`, raw exports, Perfetto traces, and logs.

<details>
<summary>Change run options or check the tooling</summary>

| Environment variable        | Default                     | Purpose                                      |
| --------------------------- | --------------------------- | -------------------------------------------- |
| `PERFORMANCE_ITERATIONS`    | `20`                        | Frame iterations, from 1 to 100.             |
| `PERFORMANCE_TIMING_CYCLES` | `20`                        | Timing/input cycles, from 1 to 100.          |
| `PERFORMANCE_ABI`           | Connected device ABI        | Limit the compiled ABI, such as `arm64-v8a`. |
| `PERFORMANCE_OUTPUT`        | Timestamped artifact folder | Output directory; it must not already exist. |

```sh
PERFORMANCE_ITERATIONS=10 PERFORMANCE_TIMING_CYCLES=10 \
  yarn perf:android native-release
```

`yarn test:performance` checks collectors, parsers, the profiling resolver, and PR comment handling. It **does not collect device measurements**. `yarn typecheck` checks the scripts and library types.

The runner clears this example's old benchmark exports before collection to avoid stale results. On emulators it suppresses only Macrobenchmark's `EMULATOR` warning; other validity checks remain enabled.

</details>

## Compare a pull request

The PR report shows **Base | PR / current | Change**. Changes are absolute: **percentage points** for missed frames and **milliseconds** for preparation, rather than percentage changes.

The baseline must be a successful Performance run at the PR's **exact base commit** on its base branch. Comparisons require matching scenario/measurement versions, mode, device/API/ABI, sample counts, and React Native, Reanimated, and Node versions.

Missing, expired, invalid, or incompatible artifacts show **“No compatible baseline.”** Local runs do not look up a baseline. Current reports use Gallery fixture version **4** and measurement definition version **3**; older synthetic or version-2 measurements are not comparable.

## CI and pull-request comments

The [Performance workflow](../.github/workflows/performance.yml) runs both modes on PRs to `main`, pushes to `main`, and manual dispatch. **Performance CI is Android-only**; check iOS transitions locally after native iOS changes and before releases.

- **Find results:** workflow job summaries and one updated bot comment per PR. Detailed release comparisons and React profiling tables are expandable.
- **Download artifacts:** compact summaries remain for **30 days**; raw data and traces for **7 days**.
- **Collection failures:** the comment includes failed runs and missing baselines. Older PR-head results do not replace current results.

<details>
<summary>If PR comments are missing</summary>

The [comment workflow](../.github/workflows/performance-comment.yml) and its trusted [`post-comment.mts`](../scripts/performance/post-comment.mts) must already be merged into the default branch. Adding them in a PR alone does not activate comments for that PR. Actions must have the required permissions; fork runs may need maintainer approval.

Benchmark jobs have read-only repository permissions. The separate publisher reads bounded summary JSON and does not execute PR code with its comment-writing token.

</details>

## Optional startup diagnostics

Use `ChoreographyProvider`'s **`onPreparationTrace`** to investigate slow forward preparation. The benchmark enables it and adds a separate diagnostic table without changing the main metrics. Apps without the callback do not buffer traces.

<details>
<summary>What traces mean and how to compare them</summary>

Traces break down source measurement, navigation/target resolution, screen readiness, Android frame waiting, coordinator preparation, and overlay readiness. Coordinator stages include registration, native preparation, cache validation, measurement, and pairing.

- Timestamps use JavaScript `performance.now()`. Observations are buffered and delivered after preparation, without React updates or logging during a stage.
- Repeated stages are summed within each journey before calculating medians or P95. Parent and child stages can overlap—**do not add them together**.
- `requestToOverlayReadyMs` ends when JavaScript observes both overlay acknowledgments. It excludes deferred observer delivery and is a readiness proxy, **not first presented motion**.
- `overlay-timeout` traces retain stage timings but omit that readiness value. Reports show traced, acknowledged, and timed-out counts. A timeout alone does not discard otherwise valid navigation or its original preparation sample.
- Tracing covers forward preparation only. Cancellation, unavailable targets, and failures have separate outcomes. Absent optional traces produce no numbers; missing or invalid traces fail collection when tracing was requested.

Compare equally instrumented runs on the same device: tracing adds clock-read and buffering overhead.

</details>

<details>
<summary>Extending the native benchmark</summary>

The [fixture](../examples/react-navigation/src/performance/PerformanceApp.tsx) waits for the image to load, two JavaScript animation frames, and Android's fully-drawn acknowledgment before exposing `benchmark-ready`. Automation uses **native touches** on the real Gallery controls; calling JavaScript handlers directly is not a valid measurement.

The [Android tests](../examples/react-navigation/android/macrobenchmark/src/main/java/screenchoreography/example/macrobenchmark/ChoreographyBenchmarks.kt) define the control sequence: start → detail settled → detail input acknowledged → back → list settled → list input acknowledged → export complete. Each reset must produce a new run ID and readiness acknowledgment. Failed or unfinished runs remain failures.

Exports are buffered during navigation and written afterward. The [native bridge](../examples/react-navigation/android/app/src/main/java/screenchoreography/example/ChoreographyBenchmark.kt) provides durable export via `finishRun`, input acknowledgment, and fully-drawn reporting. The optional `recordSample` fallback has no durable-write acknowledgment. Native timestamps stay in their own clock domain.

</details>
