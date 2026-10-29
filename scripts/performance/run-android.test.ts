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

test('Android collection waits once before Gradle without loading the emulator GUI binary', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'android benchmark '));
  const write = (name: string, body: string, executable = false) => {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body, { mode: executable ? 0o755 : 0o644 });
  };
  try {
    write(
      'sdk/platform-tools/adb',
      `#!/usr/bin/env bash
printf 'adb %s\\n' "$*" >> "$ANDROID_HOME/../launch-sequence"
case "$*" in
  'get-state') echo device ;;
  'shell getprop ro.kernel.qemu') echo 1 ;;
  'shell getprop ro.product.model') echo Pixel ;;
  'shell getprop ro.build.version.release') echo 15 ;;
  'shell getprop ro.build.version.sdk') echo 35 ;;
  'shell getprop ro.build.fingerprint') echo android-35 ;;
  'shell dumpsys SurfaceFlinger') echo 'GLES: Mesa llvmpipe' ;;
esac
`,
      true
    );
    write(
      'sdk/platform-tools/sleep',
      '#!/usr/bin/env bash\nprintf "sleep %s\\n" "$*" >> "$ANDROID_HOME/../launch-sequence"\n',
      true
    );
    write(
      'sdk/emulator/source.properties',
      'Pkg.Revision=37.2.12\nPkg.BuildId=16428233'
    );
    write(
      'sdk/emulator/emulator',
      `#!/usr/bin/env bash
touch "$ANDROID_HOME/gui-invoked"
echo 'error while loading shared libraries: libpulse.so.0' >&2
exit 127
`,
      true
    );
    write(
      'examples/react-navigation/android/gradlew',
      '#!/usr/bin/env bash\nprintf "gradle\\n" >> "$ANDROID_HOME/../launch-sequence"\nprintf "%s\\n" "$@" > "$PERFORMANCE_OUTPUT/gradle-arguments"\n',
      true
    );
    for (const name of [
      'react-native',
      'react-native-reanimated',
      'react-native-worklets',
    ])
      write(
        `examples/react-navigation/node_modules/${name}/package.json`,
        '{"version":"test"}'
      );
    // Only exercise the launcher; actual fixture/report validation has its own tests.
    write('scripts/performance/report.mts', '');
    const launcher = path.join(root, 'scripts/performance/run-android.sh');
    copyFileSync(new URL('./run-android.sh', import.meta.url), launcher);
    for (const [index, { screenCycles, trayCycles, expectedStatus = 0 }] of [
      {},
      { screenCycles: '2', trayCycles: '4' },
      { trayCycles: '6', expectedStatus: 2 },
      { screenCycles: '0', expectedStatus: 2 },
    ].entries()) {
      write('launch-sequence', '');
      const output = path.join(root, `results-${index}`);
      const result = spawnSync('bash', [launcher], {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          ANDROID_HOME: path.join(root, 'sdk'),
          ANDROID_SDK_ROOT: '',
          PERFORMANCE_OUTPUT: output,
          PERFORMANCE_ABI: 'x86_64',
          PERFORMANCE_SCREEN_TIMING_CYCLES: screenCycles,
          PERFORMANCE_TRAY_TIMING_CYCLES: trayCycles,
        },
      });
      assert.equal(result.status, expectedStatus, result.stderr);
      if (expectedStatus !== 0) {
        assert.match(
          result.stderr,
          /PERFORMANCE_(SCREEN|TRAY)_TIMING_CYCLES must be/
        );
        assert.equal(
          readFileSync(path.join(root, 'launch-sequence'), 'utf8'),
          ''
        );
        assert.equal(existsSync(output), false);
        continue;
      }
      assert.equal(existsSync(path.join(root, 'sdk/gui-invoked')), false);
      const metadata = JSON.parse(
        readFileSync(path.join(output, 'metadata.json'), 'utf8')
      );
      assert.equal(metadata.emulatorVersion, '37.2.12 (16428233)');
      assert.equal(metadata.graphicsRenderer, 'Mesa llvmpipe');
      assert.equal(metadata.screenTimingCycles, Number(screenCycles ?? 20));
      assert.equal(metadata.trayTimingCycles, Number(trayCycles ?? 5));
      assert.equal(metadata.lifecycleValidation, 2);
      assert.equal(metadata.runnerExitCode, 0);
      assert.equal(metadata.workletsVersion, 'test');
      const sequence = readFileSync(path.join(root, 'launch-sequence'), 'utf8')
        .trim()
        .split('\n');
      assert.deepEqual(
        sequence.filter((line) => line.startsWith('sleep ')),
        ['sleep 10']
      );
      assert.ok(
        sequence.indexOf('adb get-state') < sequence.indexOf('sleep 10')
      );
      assert.ok(sequence.indexOf('sleep 10') < sequence.indexOf('gradle'));
      assert.deepEqual(
        sequence.filter((line) => line === 'gradle'),
        ['gradle']
      );
      const argumentsList = readFileSync(
        path.join(output, 'gradle-arguments'),
        'utf8'
      ).split('\n');
      assert.ok(
        argumentsList.includes(
          `-Pandroid.testInstrumentationRunnerArguments.performanceScreenTimingCycles=${screenCycles ?? 20}`
        )
      );
      assert.ok(
        argumentsList.includes(
          `-Pandroid.testInstrumentationRunnerArguments.performanceTrayTimingCycles=${trayCycles ?? 5}`
        )
      );
      assert.match(
        readFileSync(path.join(output, 'gradle-arguments'), 'utf8'),
        /-PscreenChoreographyTracePresentation=true/
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
