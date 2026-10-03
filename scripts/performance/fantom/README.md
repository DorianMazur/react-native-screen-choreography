# Fantom performance and safety checks

Run `yarn perf:fantom` from the repository root. Requires Node 22.11+ (CI uses
`.nvmrc`), Java 17, a host C++ compiler, OpenSSL development headers, and an Android
SDK with CMake 3.30.5. Set `ANDROID_HOME`. The SDK supplies build tools; no emulator,
simulator, application installation, or Android runtime is used.

On macOS, install OpenSSL with `brew install openssl@3`. On Ubuntu 24.04, install
`clang libssl-dev libreadline-dev` and run
`"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$ANDROID_HOME" 'cmake;3.30.5'`.

The launcher downloads React Native 0.83.0 at a fixed commit into the ignored
`artifacts/performance/fantom/react-native` directory. Its locked Yarn 1 workspace
is isolated from this repository's Yarn 4 workspace. The first build compiles
Hermes and Fabric and takes several minutes; subsequent runs reuse that build.

## What runs

- The production `cpp/FabricLayoutCapture.cpp`, compiled directly into Fantom's
  native executable and installed before the first Fabric surface mounts.
- The production TypeScript registries, navigation session controller, transition
  coordinator, layout preparation and reverse-transition controller, copied
  unchanged into the temporary RN workspace on every run and bundled into
  optimized Hermes bytecode.
- Real React rendering, Fabric commits and Yoga layout, with Fantom's stub
  mounting manager standing in for platform views.

### Performance metrics

The 20 preparation cases measure:

- Native capture and request/consume/validation for 10 and 100 endpoints, plus
  10 endpoints with 1,000 unrelated views. The unrelated views test tree traversal
  cost; they are not additional participants. A single-endpoint case adds little
  scaling information and is omitted.
- `captureFabricLayout` source snapshots and `prepareFabricLayout` for already
  mounted endpoints, including real ref/tag resolution, C++ capture, identity
  validation, metric maps and preparation subscription cleanup.
- Layout updates with pending native requests, and full preparation waiting for
  usable geometry at 10 and 100 endpoints. These include React rendering, Yoga,
  Fabric commits, mount hooks and notification delivery. Pending preparation
  starts with zero-width endpoints and resolves after their ready layout mounts.
- Source-group discovery and target lookup with 0 or 100 unrelated screens.

Nine journey cases use the same selected items and screen names as
`examples/react-navigation/src/performance/scenarios.ts`: Gallery/Aurora,
Trips/Seiland, and Wallet/Polygon. Each has three measured operations:

| Operation | Included in the sample | Outside the sample |
| --- | --- | --- |
| Open JS/Fabric preparation | Production navigation controller: source capture, dispatch to mount detail, screen readiness; coordinator: pairing, frozen presentations, Fabric preparation, session creation and attachment gating | Initial list mount; assertions, settlement and detail removal |
| Return JS/Fabric preparation | Forward settlement; coordinator preparing backward: fresh endpoint capture, pairing, frozen presentations, session creation and attachment gating | Opening the detail; assertions, backward settlement and detail removal |
| JS/Fabric preparation round trip | Both preparation paths, explicit settlement, detail unmount, registration/readiness cleanup | Initial list mount and assertions |

`journey-fixture.js` adapts the gallery's six-tile grid, trips' two-card carousel
and wallet's six rows at a fixed 420 × 800 viewport. It uses their group/element
names and sizing rules, with fixed header offsets. Plain Fabric views stand in
for text, images and payloads; the detail endpoint is an empty receiver. The list
stays mounted across samples, and each open mounts a fresh detail endpoint.
The examples naturally have one participating pair; these are journey workloads,
separate from the synthetic 10/100-endpoint scaling cases.

These fixtures execute `NavigationSessionController.prepareForwardTransition`
and `TransitionCoordinator.startTransition`, including their actual asynchronous
ownership checks and native mount subscriptions. Attachment and presentation
acknowledgements are controlled callbacks. Reanimated's `makeMutable` is replaced
with single-runtime value storage in the isolated workspace; the adapter supplies
no animation, hook or scheduling APIs. It cannot measure cross-runtime work.
The return calls the coordinator directly; native route removal and reverse
handoff are outside these timed journeys.

They do not import the actual example screen components or render the provider,
overlay or portal transfer. Keep their geometry in sync with
`examples/shared/{gallery,trips,wallet}` when changing those layouts. E2E and
Fantom journey timings are different metrics: these measure JS/Fabric work on
simplified screens, excluding platform attachment/presentation latency.

Each of the 29 cases warms up for at least 100 ms and 50 iterations, then records
at least 250 ms and 200 measured iterations. Assertions verify valid work and
samples, including in CI, where upstream Fantom otherwise skips measurement.
The 20 low-level layout cases isolate geometry computation; the nine journey
cases include the coordinator path with the controlled boundaries above.

### Safety and edge cases

Ordinary pass/fail tests are separate from benchmark suites and produce no
performance metrics. They cover:

- Completed mounts, layout changes, atomic capture failure, screen scoping,
  one-shot requests, and mount subscription cleanup.
- Synchronous preparation, pending geometry, missing refs, duplicate IDs,
  cancellation followed by late mounts, superseded requests, removed/replaced
  endpoints, and repeated completion/cancellation cycles.
- Both handoff signal orders, duplicate callbacks, delayed navigation
  acknowledgements, wrong session/screen signals, cancellation before commit,
  rejected removal, interruption, invalidation and replacement of sessions.
- For each example journey: 20 consecutive round trips with stable list identity
  and no retained detail registrations, return after a layout change, delayed
  detail geometry, screen-readiness blockers, delayed target registration,
  attachment gating, and Back during pending preparation followed by immediate
  reopen. They verify frozen presentations alongside refreshed target geometry
  and reject attachment callbacks from cancelled sessions. Handoff coordination
  is checked only for correctness, never timed.

## Results and limits

`artifacts/performance/fantom/results/` contains a Markdown summary, Jest results,
all measured timing samples, and host/build/source metadata. Times use milliseconds
in JSON and microseconds in the summary. Linux uses thread CPU time; macOS uses
Fantom's monotonic elapsed clock. Compare repeated runs on the same host/build;
do not compare macOS and Linux timings.

These are diagnostic benchmarks, with no arbitrary regression threshold or
automatic baseline comparison yet. They fail for broken behavior, missing
measurements, or skipped tests. The separate `Fantom performance` workflow runs on
Ubuntu 24.04 for relevant PRs and manually, and uploads results and build logs.

The strongest value is exercising production JS and C++ together: invalid layout,
stale endpoint, lifecycle and cleanup regressions can fail here even when mocks
would pass. Timing samples help locate computation and scaling regressions on a
comparable host. They do not predict device preparation time or animation quality.

Fantom does not exercise our Kotlin/Objective-C overlay host, native-stack,
Reanimated's separate UI runtime, GPU drawing, or real frame deadlines. Keep the
Android and iOS performance suites to measure those paths.

## Upstream adapter

`react-native.patch` is applied only to the downloaded, pinned RN checkout. It
enables Release compilation and Hermes bytecode in the OSS runner, installs our
capture binding, selects Linux thread CPU timing, and preserves raw benchmark
samples. It also accommodates RN 0.83's fmt dependency on Apple Clang 21.
The package-version check and patch context deliberately fail when RN changes;
review and update them together rather than silently benchmarking a different RN.

To reset the harness, remove `artifacts/performance/fantom` and rerun. The
integration adds no runtime dependency to the published library.
