import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(process.argv[1]);
const root = path.resolve(here, '../../..');
const output = path.join(root, 'artifacts/performance/fantom');
const checkout = path.join(output, 'react-native');
const resultsDir = path.join(output, 'results');
const clock =
  process.platform === 'linux'
    ? 'thread CPU time'
    : 'mach monotonic elapsed time';
const revision = 'a98aa814cfe65e296e28000fc8091065f0632660'; // RN 0.83.0
const ndkVersion = '27.1.12297006'; // RN 0.83.0's Gradle version catalog
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'))
);
if (packageJson.devDependencies['react-native'] !== '0.83.0') {
  throw new Error(
    'Update the Fantom pin and patch when changing React Native.'
  );
}
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk)
  throw new Error(
    'Set ANDROID_HOME to an Android SDK with CMake 3.30.5. No emulator is needed.'
  );
const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  // RN's root build reads these even when building Fantom for the host. Select
  // the pinned NDK instead of inheriting the GitHub runner's default toolchain.
  ANDROID_NDK: path.join(sdk, 'ndk', ndkVersion),
  ANDROID_NDK_VERSION: ndkVersion,
  CHOREOGRAPHY_ROOT: root,
  CHOREOGRAPHY_RESULTS_DIR: resultsDir,
  CMAKE_BUILD_PARALLEL_LEVEL: process.env.CMAKE_BUILD_PARALLEL_LEVEL || '4',
  YARN_IGNORE_PATH: '1',
  COREPACK_ENABLE_AUTO_PIN: '0',
};
// Fantom links OpenSSL on the host. Homebrew doesn't put it on CMake's default path.
if (!env.CMAKE_PREFIX_PATH && process.platform === 'darwin') {
  const brew = spawnSync('brew', ['--prefix', 'openssl@3'], {
    encoding: 'utf8',
  });
  if (brew.status === 0) env.CMAKE_PREFIX_PATH = brew.stdout.trim();
}
function run(command, args, cwd = checkout, log) {
  const fd = log ? fs.openSync(path.join(output, log), 'w') : null;
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: fd == null ? 'inherit' : ['ignore', fd, fd],
  });
  if (fd != null) fs.closeSync(fd);
  if (result.error || result.status !== 0) {
    if (log) {
      console.error(
        fs
          .readFileSync(path.join(output, log), 'utf8')
          .split('\n')
          .slice(-80)
          .join('\n')
      );
    }
    if (log === 'build.log') {
      // RN's Gradle tasks redirect compiler diagnostics out of the Gradle log.
      const reports = path.join(
        checkout,
        'private/react-native-fantom/build/reports'
      );
      if (fs.existsSync(reports)) {
        for (const file of fs
          .readdirSync(reports)
          .filter((name) => name.endsWith('.error.log'))) {
          const tail = fs
            .readFileSync(path.join(reports, file), 'utf8')
            .trim()
            .split('\n')
            .slice(-80)
            .join('\n');
          if (tail) console.error(`${file}:\n${tail}`);
        }
      }
    }
    throw new Error(
      `${command} failed (${result.status}). ${result.error?.message || ''}${log ? ` See ${path.join(output, log)}` : ''}`
    );
  }
}
function git(...args) {
  const result = spawnSync('git', args, { cwd: checkout, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

fs.mkdirSync(output, { recursive: true });
fs.rmSync(resultsDir, { recursive: true, force: true });
fs.mkdirSync(resultsDir, { recursive: true });
if (!fs.existsSync(checkout)) {
  console.log('Fetching pinned React Native sources for Fantom…');
  run(
    'git',
    [
      'clone',
      '--depth',
      '1',
      '--branch',
      'v0.83.0',
      'https://github.com/react/react-native.git',
      checkout,
    ],
    root
  );
}
if (git('rev-parse', 'HEAD') !== revision) {
  throw new Error(`Unexpected Fantom checkout. Remove ${checkout} and rerun.`);
}
const patch = path.join(here, 'react-native.patch');
const patched = spawnSync('git', ['apply', '--reverse', '--check', patch], {
  cwd: checkout,
});
if (patched.status !== 0) run('git', ['apply', patch]);

const installStamp = path.join(
  checkout,
  'node_modules/.choreography-installed'
);
if (!fs.existsSync(installStamp)) {
  console.log('Installing Fantom build dependencies…');
  run(
    'npx',
    [
      '--yes',
      'yarn@1.22.22',
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
    ],
    checkout,
    'install.log'
  );
  fs.writeFileSync(installStamp, revision);
}
console.log(
  'Building optimized Hermes, Fabric and the library capture code… (first build takes several minutes)'
);
run(
  './gradlew',
  [
    ':private:react-native-fantom:buildFantomTester',
    '--max-workers=4',
    '--console=plain',
  ],
  checkout,
  'build.log'
);

// Metro bundles within RN's own workspace. Refresh exact source copies each run
// instead of introducing a second implementation or resolving our app's RN mocks.
const staged = path.join(checkout, 'private/react-native-fantom/choreography');
const stagedTests = path.join(staged, 'scripts/performance/fantom');
fs.rmSync(staged, { recursive: true, force: true });
fs.mkdirSync(staged, { recursive: true });
fs.cpSync(path.join(root, 'src'), path.join(staged, 'src'), {
  recursive: true,
});
fs.cpSync(path.join(here, '__tests__'), path.join(stagedTests, '__tests__'), {
  recursive: true,
});
for (const fixture of [
  'fixture.js',
  'handoff-fixture.js',
  'journey-fixture.js',
  'reanimated-values.js',
]) {
  fs.copyFileSync(path.join(here, fixture), path.join(stagedTests, fixture));
}
// Resolve the coordinator's sole Reanimated runtime import inside the isolated
// fixture workspace. Production source is copied unchanged; the real package,
// application and published library are unaffected.
const reanimatedAdapter = path.join(
  staged,
  'node_modules/react-native-reanimated'
);
fs.mkdirSync(reanimatedAdapter, { recursive: true });
fs.writeFileSync(
  path.join(reanimatedAdapter, 'package.json'),
  JSON.stringify({
    name: 'react-native-reanimated',
    private: true,
    main: 'index.js',
  })
);
fs.copyFileSync(
  path.join(here, 'reanimated-values.js'),
  path.join(reanimatedAdapter, 'index.js')
);
const scenarioFile = 'examples/react-navigation/src/performance/scenarios.ts';
fs.mkdirSync(path.dirname(path.join(staged, scenarioFile)), {
  recursive: true,
});
fs.copyFileSync(path.join(root, scenarioFile), path.join(staged, scenarioFile));
fs.writeFileSync(
  path.join(staged, 'jest.config.cjs'),
  `module.exports = {
  ...require('../config/jest.config'),
  roots: ['<rootDir>/private/react-native-fantom/choreography'],
};\n`
);
const sourceHash = createHash('sha256');
sourceHash
  .update(scenarioFile)
  .update(fs.readFileSync(path.join(root, scenarioFile)));
for (const directory of ['cpp', 'src', 'scripts/performance/fantom']) {
  const files = fs
    .readdirSync(path.join(root, directory), { recursive: true })
    .sort();
  for (const file of files) {
    const absolute = path.join(root, directory, file);
    if (fs.statSync(absolute).isFile())
      sourceHash
        .update(`${directory}/${file}\0`)
        .update(fs.readFileSync(absolute));
  }
}
fs.writeFileSync(
  path.join(resultsDir, 'metadata.json'),
  JSON.stringify(
    {
      reactNative: '0.83.0',
      revision,
      build: 'Release',
      javascript: 'optimized Hermes bytecode',
      platform: process.platform,
      arch: process.arch,
      os: os.release(),
      cpu: os.cpus()[0]?.model,
      clock,
      adapters: {
        reanimated: 'single-runtime mutable value storage only',
        presentation: 'controlled attachment and presentation acknowledgements',
        screens:
          'geometry-only React fixtures; no native-stack or portal transfer',
      },
      sourceHash: sourceHash.digest('hex'),
      recordedAt: new Date().toISOString(),
    },
    null,
    2
  )
);
env.FANTOM_FORCE_OSS_BUILD = '1';
console.log(
  'Running preparation benchmarks, example journeys and safety checks…'
);
run(
  process.execPath,
  [
    'node_modules/jest/bin/jest.js',
    '--config',
    path.join(staged, 'jest.config.cjs'),
    '--runInBand',
    '--ci',
    '--json',
    '--outputFile',
    path.join(resultsDir, 'tests.json'),
  ],
  checkout,
  'tests.log'
);

const testFiles = fs
  .readdirSync(path.join(here, '__tests__'))
  .filter((file) => file.endsWith('-itest.js'))
  .sort();
const benchmarks = testFiles
  .filter((file) => file.endsWith('-benchmark-itest.js'))
  .map((file) => ({
    file,
    timings: JSON.parse(
      fs.readFileSync(path.join(resultsDir, `${file}.json`))
    ).flatMap((entry) => entry.result.timings),
  }));
if (benchmarks.some(({ timings }) => timings.length === 0)) {
  throw new Error('A benchmark suite produced no timings.');
}
const tests = JSON.parse(fs.readFileSync(path.join(resultsDir, 'tests.json')));
if (
  !tests.success ||
  tests.numPendingTests ||
  tests.numFailedTests ||
  tests.numPassedTests === 0 ||
  tests.testResults.length !== testFiles.length ||
  testFiles.some(
    (file) =>
      !tests.testResults.some(
        (result) =>
          path.basename(result.name) === file &&
          result.status === 'passed' &&
          result.assertionResults.length > 0
      )
  )
) {
  throw new Error('Fantom skipped or failed required tests. Check tests.json.');
}
const summary = [
  '### Fantom performance benchmarks',
  '',
  `RN 0.83.0 · Release · optimized Hermes bytecode · ${process.platform}/${process.arch} · ${clock}`,
  '',
  'Journey timings cover production JS navigation/coordinator work and real Fabric capture on simplified screens. Reanimated value storage is adapted; native attachment/presentation signals are controlled. Native-stack, UI-runtime and displayed-frame latency are excluded. No timing regression threshold is applied.',
  '',
  ...benchmarks.flatMap(({ file, timings }) => [
    `#### ${file.startsWith('preparation-') ? 'Layout preparation' : 'Example preparation journeys'}`,
    '',
    '| Operation | Median (µs) | p99 (µs) | Samples |',
    '| --- | ---: | ---: | ---: |',
    ...timings.map(
      ({ name, latency }) =>
        `| ${name} | ${(latency.p50 * 1000).toFixed(2)} | ${(latency.p99 * 1000).toFixed(2)} | ${latency.samples.length} |`
    ),
    '',
  ]),
  '',
  `${tests.numPassedTests - benchmarks.length} safety checks and ${benchmarks.length} benchmark suites passed. Only benchmark cases produce timing metrics; raw samples and metadata are saved beside this report.`,
  '',
].join('\n');
fs.writeFileSync(path.join(resultsDir, 'summary.md'), summary);
if (process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
console.log(`Results: ${resultsDir}`);
