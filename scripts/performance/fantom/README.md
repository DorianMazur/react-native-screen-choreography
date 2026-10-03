# Fantom performance and safety checks

Run `yarn perf:fantom` from the repository root. Requires Node 22.11+ (CI uses
`.nvmrc`), Java 17, a host C++ compiler, OpenSSL development headers, and an Android
SDK with CMake 3.30.5 and NDK 27.1.12297006. Set `ANDROID_HOME`. RN's Gradle
configuration requires the pinned NDK even for this host build; the launcher
selects it instead of inheriting runner NDK overrides. No emulator, simulator,
application installation, or Android runtime is used.

On macOS, install OpenSSL with `brew install openssl@3`. On Ubuntu 24.04, install
`clang-18 g++-12 libssl-dev libreadline-dev` and run
`"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$ANDROID_HOME" 'cmake;3.30.5' 'ndk;27.1.12297006'`.

## What runs

- The production `cpp/FabricLayoutCapture.cpp`, compiled directly into Fantom's
  native executable and installed before the first Fabric surface mounts.
- The production TypeScript registries, navigation session controller, transition
  coordinator, layout preparation and reverse-transition controller, copied
  unchanged into the temporary RN workspace on every run and bundled into
  optimized Hermes bytecode.
- Real React rendering, Fabric commits and Yoga layout, with Fantom's stub
  mounting manager standing in for platform views.
