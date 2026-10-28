import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('iOS launcher requires lifecycle checks and preserves native failures when reporting', () => {
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
  if [[ "$BUILD_EXIT_STATUS" != 0 ]]; then exit "$BUILD_EXIT_STATUS"; fi
  while [[ "$1" != -derivedDataPath ]]; do shift; done
  python3 - "$2/Build/Products/ChoreographyPerformance_fixture.xctestrun" <<'PY'
import plistlib,sys
with open(sys.argv[1], 'wb') as f: plistlib.dump({'Tests': {'TestBundlePath': 'fixture'}}, f)
PY
else
  echo 'XCTest fixture finished'
  exit "$TEST_EXIT_STATUS"
fi
`,
      true
    );
    for (const name of [
      'react-native',
      'react-native-reanimated',
      'react-native-worklets',
    ]) {
      write(
        `examples/react-navigation/node_modules/${name}/package.json`,
        '{"version":"test"}'
      );
    }
    write('examples/react-navigation/ios/Podfile.lock', 'matching');
    write('examples/react-navigation/ios/Pods/Manifest.lock', 'matching');
    // Report validation is covered separately; exercise the real launcher here.
    write(
      'scripts/performance/report.mts',
      'process.exitCode = Number(process.env.REPORT_EXIT_STATUS ?? 0);'
    );
    copyFileSync(
      new URL('./run-ios.sh', import.meta.url),
      path.join(root, 'scripts/performance/run-ios.sh')
    );
    for (const [buildStatus, testStatus, reportStatus, expectedStatus] of [
      [0, 0, 0, 0],
      [0, 0, 1, 1],
      [0, 65, 1, 65],
      [66, 0, 1, 66],
    ]) {
      const output = path.join(root, `results-${expectedStatus}`);
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
            BUILD_EXIT_STATUS: String(buildStatus),
            TEST_EXIT_STATUS: String(testStatus),
            REPORT_EXIT_STATUS: String(reportStatus),
          },
        }
      );
      assert.equal(result.status, expectedStatus, result.stderr);
      const metadata = JSON.parse(
        readFileSync(path.join(output, 'metadata.json'), 'utf8')
      );
      assert.equal(metadata.lifecycleValidation, 2);
      assert.equal(metadata.runnerExitCode, buildStatus || testStatus);
      assert.equal(metadata.workletsVersion, 'test');
      const argumentsList = readFileSync(
        path.join(output, 'xcode-arguments'),
        'utf8'
      ).split('\n');
      assert.ok(
        argumentsList.includes('SCREEN_CHOREOGRAPHY_TRACE_PRESENTATION=1')
      );
      assert.equal(
        argumentsList.filter((arg) => arg === 'build-for-testing').length,
        1
      );
      assert.equal(
        argumentsList.filter((arg) => arg === 'test-without-building').length,
        buildStatus === 0 ? 1 : 0
      );
      if (buildStatus === 0)
        assert.equal(
          readFileSync(path.join(output, 'tests.log'), 'utf8'),
          'XCTest fixture finished\n'
        );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
