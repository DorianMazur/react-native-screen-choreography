#!/usr/bin/env bash
set -euo pipefail

# emulator-runner installs the latest emulator before applying emulator-build.
# Pre-install it with retries so its unguarded install sees a current package.
android_sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[[ -n "$android_sdk_root" && "$android_sdk_root" != / && -d "$android_sdk_root" ]] || {
  echo 'Set ANDROID_HOME to an existing Android SDK directory.' >&2
  exit 2
}
sdkmanager="$android_sdk_root/cmdline-tools/latest/bin/sdkmanager"
[[ -x "$sdkmanager" ]] || {
  echo "Android SDK command-line tools are unavailable: $sdkmanager" >&2
  exit 2
}

for attempt in 1 2 3; do
  # Process substitution keeps yes's expected SIGPIPE from masking a successful
  # sdkmanager exit when pipefail is enabled.
  if "$sdkmanager" --install emulator --channel=0 < <(yes); then
    printf 'Android Emulator installed (attempt %s).\n' "$attempt"
    exit 0
  else
    status=$?
  fi
  if [[ "$attempt" -eq 3 ]]; then
    echo "::error::Android Emulator installation failed after $attempt attempts (exit $status)." >&2
    exit "$status"
  fi
  echo "::warning::Android Emulator installation attempt $attempt failed; retrying with a fresh download." >&2
  # Only disposable SDK staging/cache directories are removed. Keep installed
  # packages, including the runner image's existing emulator, intact.
  rm -rf "$android_sdk_root/.temp" "$android_sdk_root/.downloadIntermediates"
  sleep 10
done
