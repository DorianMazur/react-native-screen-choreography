# Performance measurements

The Android benchmark runs the actual shared Gallery example with the normal
production React renderer. Each cycle opens Aurora, verifies a native touch on
the detail screen, returns to the list, and verifies another native touch there.
The default is **20 consecutive forward → backward cycles**, producing 20
preparation samples in each direction from one Activity launch.

There is one build mode, `native-release`. React profiling and the separate
frame-deadline benchmark are removed. The live photo owner must remain mounted
through all cycles. Lightbox, scrolling, sharing, and gesture cancellation are
outside this benchmark's scope.

## Run locally

Use the Node version in `.nvmrc`, pinned Yarn, JDK 17, Android SDK, and one booted
Android device or emulator. Set `ANDROID_HOME` or `ANDROID_SDK_ROOT`. CI uses API
35. Keep system animations enabled.

```sh
yarn install --immutable
yarn test:performance
yarn perf:android native-release
```

The mode argument is optional. The runner builds bundled JavaScript and the
non-debuggable `benchmark` app variant; Metro need not be running. It executes
one instrumentation test, `repeatedNavigationTimingAndInput`, in the existing
`macrobenchmark` module. This test uses UiAutomator to inject real device touches.

`test:performance` checks collectors, report validation, baseline selection,
and comment formatting. It does not run a device. Run `yarn typecheck` and
`yarn lint` for static checks.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PERFORMANCE_TIMING_CYCLES` | `20` | Complete forward/back cycles; integer from 1 to 100. |
| `PERFORMANCE_ABI` | Device ABI | ABI to compile, such as `arm64-v8a` or `x86_64`. |
| `PERFORMANCE_OUTPUT` | Timestamped directory under `artifacts/performance/` | Must be a new directory. |

```sh
PERFORMANCE_TIMING_CYCLES=20 \
  PERFORMANCE_OUTPUT=artifacts/performance/android-comparison-01 \
  yarn perf:android
```

The runner clears previous fixture exports and instrumentation additional outputs
before collecting, so old data cannot make a failed run look successful. It saves
raw fixture JSON, build logs, logcat, metadata, and `report/summary.json` and
`report/summary.md`. It no longer collects frame-timing Perfetto traces.

## Measurements

| Headline metric | Meaning |
| --- | --- |
| Open preparation (ms) | Forward request until the session becomes active in JavaScript. |
| Return preparation (ms) | Backward request until the session becomes active in JavaScript. |

These are medians, not first visible motion or handoff latency. Input probes and
payload lifecycle observations validate successful journeys. Their raw timestamps
remain in exported JSON; probe delays include automation wait/polling and must
not be interpreted as exact time-to-interactive.

Workflow summaries and PR comments show **Base | PR / current | Change**.
Changes are absolute milliseconds. A missing or incompatible baseline is
explicitly identified, and its values remain unavailable rather than zero.

Workflow summaries also include optional startup diagnostics for **both**
`gallery.forward` and `gallery.backward`: stage sample counts, medians, P95 when
at least 20 samples exist, and overlay acknowledgment/timeout counts. PR comments
include only the two headline preparation metrics, with no startup diagnostics.

`onPreparationTrace` measures source measurement, coordinator preparation,
applicable target measurement/readiness stages, and overlay readiness. Back uses
the still-mounted list endpoint, so it does not have the forward screen-mount
stages. Request-to-overlay-ready is a JavaScript proxy, not first presented motion.
Nested stages must not be added together; repeated stages are summed within each
journey. Timeout journeys retain their stage timings and timeout count but do not
contribute an acknowledged request-to-overlay-ready value.

The benchmark enables tracing. Missing or invalid traces in either direction,
missing input acknowledgments, wrong journey order, or a cycle-count mismatch
invalidate collection. Traces attach by session ID even if delivered after a
later request starts. Observer work is deferred until preparation returns.

## Baselines and CI

The Performance workflow runs one native-release job. For PRs, both its summary
and the later comment publisher fetch a successful push run at the exact PR base
commit and branch. Push summaries compare against the branch tip before that
push. Manual runs without a baseline commit explain that comparison is unavailable.

Baseline compatibility requires matching fixture and measurement versions,
platform, build mode, device/API/ABI, cycle count, and React Native, Reanimated,
and Node versions. Rows also require matching sample counts. Runner image
versions are recorded for diagnosis but are not a compatibility gate. A missing,
expired, failed, or incompatible report never becomes a zero baseline.

Reports now use fixture version **5**, measurement definition **4**, and
preparation-tracing version **2**. Older reports are intentionally incompatible;
a new successful base-branch run is required before comparisons are available.

The PR-comment workflow runs trusted default-branch code with comment-write
permission. It reads bounded JSON artifacts without extracting or executing PR
code. It updates only the current open PR head and rechecks the base/head before
posting. Publisher changes take effect after merging to the default branch;
this PR cannot change the trusted publisher used for its own comment.

A passing run means collection and validation succeeded. Emulator performance
numbers remain informational; there is no latency regression threshold.
