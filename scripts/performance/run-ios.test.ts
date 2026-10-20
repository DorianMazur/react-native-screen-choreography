import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('iOS launcher wires opt-in breadcrumbs, sampling provenance, and XCTest exit status', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ios benchmark '));
  const write = (name: string, body: string, executable = false) => {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body, { mode: executable ? 0o755 : 0o644 });
  };
  try {
    write('bin/sleep', '#!/bin/bash\nexit 0\n', true);
    write(
      'bin/xcrun',
      `#!/bin/bash
case "$*" in
  'simctl create '*) echo owned-simulator ;;
  'simctl getenv '*) echo 26.2 ;;
  'simctl spawn '*"log show"*) echo native-breadcrumb-export ;;
esac
`,
      true
    );
    write(
      'bin/xcodebuild',
      `#!/bin/bash
if [[ "$1" == -version ]]; then echo 'Xcode fixture'; exit 0; fi
printf '%s\\n' "$@" >> "$PERFORMANCE_OUTPUT/xcode-arguments"
if [[ "$1" == build-for-testing ]]; then
  while [[ "$1" != -derivedDataPath ]]; do shift; done
  python3 - "$2/Build/Products/ChoreographyPerformance_fixture.xctestrun" <<'PY'
import plistlib,sys
with open(sys.argv[1], 'wb') as f: plistlib.dump({'Tests': {'TestBundlePath': 'fixture'}}, f)
PY
else
  if [[ "$PERFORMANCE_NATIVE_BREADCRUMBS" == 1 ]]; then
    mkdir -p "$PERFORMANCE_OUTPUT/diagnostics"
    echo '{}' > "$PERFORMANCE_OUTPUT/diagnostics/hang-trigger.json"
  fi
  echo 'XCTest fixture finished'
  exit "$TEST_EXIT_STATUS"
fi
`,
      true
    );
    for (const name of ['react-native', 'react-native-reanimated']) {
      write(
        `examples/react-navigation/node_modules/${name}/package.json`,
        '{"version":"test"}'
      );
    }
    write('examples/react-navigation/ios/Podfile.lock', 'matching');
    write('examples/react-navigation/ios/Pods/Manifest.lock', 'matching');
    // Report validation is covered separately; exercise the real launcher/watcher here.
    write(
      'scripts/performance/report.mts',
      'process.exitCode = Number(process.env.REPORT_EXIT_STATUS ?? 0);'
    );
    for (const file of ['run-ios.sh', 'ios-hang-diagnostics.mts']) {
      copyFileSync(
        new URL(file, import.meta.url),
        path.join(root, 'scripts/performance', file)
      );
    }
    for (const breadcrumbs of ['0', '1']) {
      const output = path.join(root, `results-${breadcrumbs}`);
      const result = spawnSync(
        'bash',
        [path.join(root, 'scripts/performance/run-ios.sh')],
        {
          encoding: 'utf8',
          timeout: 15000,
          env: {
            ...process.env,
            PATH: `${root}/bin:${process.env.PATH}`,
            USE_CCACHE: '0',
            PERFORMANCE_OUTPUT: output,
            PERFORMANCE_DERIVED_DATA: path.join(root, 'derived'),
            PERFORMANCE_NATIVE_BREADCRUMBS: breadcrumbs,
            TEST_EXIT_STATUS: breadcrumbs === '1' ? '65' : '0',
            REPORT_EXIT_STATUS: breadcrumbs === '1' ? '1' : '0',
          },
        }
      );
      assert.equal(result.status, breadcrumbs === '1' ? 65 : 0, result.stderr);
      const metadata = JSON.parse(
        readFileSync(path.join(output, 'metadata.json'), 'utf8')
      );
      assert.equal(metadata.nativeBreadcrumbs, breadcrumbs === '1');
      assert.equal(metadata.hangSamplingTriggered, breadcrumbs === '1');
      assert.equal(metadata.lifecycleValidation, 1);
      assert.equal(metadata.runnerExitCode, breadcrumbs === '1' ? 65 : 0);
      if (breadcrumbs === '1')
        assert.match(
          metadata.diagnosticErrors.join(),
          /Incomplete native breadcrumb coverage/
        );
      assert.ok(
        readFileSync(path.join(output, 'xcode-arguments'), 'utf8').includes(
          `SCREEN_CHOREOGRAPHY_TRACE_HANGS=${breadcrumbs}`
        )
      );
      assert.equal(
        readFileSync(path.join(output, 'tests.log'), 'utf8'),
        'XCTest fixture finished\n'
      );
      assert.equal(
        existsSync(path.join(output, 'diagnostics/native-breadcrumbs.log')),
        breadcrumbs === '1'
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
