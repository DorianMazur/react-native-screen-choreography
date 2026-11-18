import { distribution, markdown } from './report.mts';
import { sameRunnerBase } from './summary-table.mts';
import type { InputRecord } from './types.ts';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Pools one side's rounds into a report with the shape of a single run. */
export function pool(rounds: InputRecord[]): InputRecord {
  const first = rounds[0]!;
  const samples: Record<string, number[]> = {};
  const diagnostics: Record<string, Record<string, number>> = {};
  for (const round of rounds) {
    for (const [key, values] of Object.entries(round.samples ?? {}))
      (samples[key] ??= []).push(...(values as number[]));
    for (const [journey, counts] of Object.entries(
      round.preparationDiagnostics ?? {}
    ))
      for (const [name, count] of Object.entries(counts as InputRecord))
        (diagnostics[journey] ??= {})[name] =
          (diagnostics[journey]![name] ?? 0) + count;
  }
  const total = (name: string) =>
    rounds.reduce((sum, round) => sum + (round.metadata?.[name] ?? 0), 0);
  return {
    ...first,
    metadata: {
      ...first.metadata,
      screenTimingCycles: total('screenTimingCycles'),
      trayTimingCycles: total('trayTimingCycles'),
      runnerExitCode: Math.max(
        ...rounds.map((round) => round.metadata?.runnerExitCode ?? 0)
      ),
      abRounds: rounds.length,
    },
    valid: rounds.every((round) => round.valid === true),
    errors: rounds.flatMap((round, index) =>
      (round.errors ?? []).map(
        (error: string) => `Round ${index + 1}: ${error}`
      )
    ),
    sources: rounds.flatMap((round) => round.sources ?? []),
    samples,
    preparationDiagnostics: diagnostics,
    metrics: Object.fromEntries(
      Object.entries(samples)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, values]) => [key, distribution(values)])
    ),
  };
}

const RESAMPLES = 2000;

/**
 * A 99% range for the change in medians (current minus base), from resampling
 * each side's samples. Samples scatter widely within one run, so a range that
 * includes zero cannot be told apart from that scatter. Seeded by the metric
 * so a report is reproducible from its samples.
 */
export function changeInterval(
  base: number[],
  head: number[],
  seed: string
): [number, number] | null {
  if (base.length < 2 || head.length < 2) return null;
  // A linear congruential generator; every product stays below 2^53.
  const modulus = 4294967296;
  let state = 0;
  for (const character of seed)
    state = (state * 31 + character.charCodeAt(0)) % modulus;
  const random = () => {
    state = (state * 1664525 + 1013904223) % modulus;
    return state / modulus;
  };
  const resampledMedian = (values: number[]) => {
    const draw = values
      .map(() => values[Math.floor(random() * values.length)]!)
      .sort((a, b) => a - b);
    const middle = (draw.length - 1) / 2;
    return (draw[Math.floor(middle)]! + draw[Math.ceil(middle)]!) / 2;
  };
  const changes = Array.from(
    { length: RESAMPLES },
    () => resampledMedian(head) - resampledMedian(base)
  ).sort((a, b) => a - b);
  return [
    changes[Math.floor(RESAMPLES * 0.005)]!,
    changes[Math.ceil(RESAMPLES * 0.995) - 1]!,
  ];
}

/**
 * The current side's pooled report, carrying the base side measured in the same
 * session. Both arguments hold one entry per round, empty where a run left no
 * report. A base that could not be measured leaves the report itself intact.
 */
export function combine(
  head: (InputRecord | undefined)[],
  base: (InputRecord | undefined)[],
  info: {
    platform: string;
    mode: string;
    rounds: number;
    baseRevision: string;
    retried?: string[];
  }
): InputRecord {
  const measured = head.filter((round) => round !== undefined);
  if (!measured.length)
    return {
      schemaVersion: 1,
      platform: info.platform,
      mode: info.mode,
      valid: false,
      metrics: {},
      errors: ['No A/B round produced a report for the current sources.'],
    };
  let summary = pool(measured);
  if (measured.length < info.rounds) {
    summary.valid = false;
    summary.errors.push(
      `Only ${measured.length} of ${info.rounds} A/B rounds produced a report for the current sources.`
    );
  }
  // A base round that failed leaves the rounds it passed comparable. Both
  // sides then pool the same rounds, so their sample counts still match.
  const compared = summary.valid
    ? head.flatMap((_, round) => (base[round]?.valid === true ? [round] : []))
    : [];
  if (compared.length && compared.length < measured.length)
    summary = pool(compared.map((round) => head[round]!));
  const sameRunner: InputRecord = {
    baseRevision: info.baseRevision,
    rounds: info.rounds,
    comparedRounds: compared.length,
    retried: info.retried ?? [],
  };
  summary.sameRunner = sameRunner;
  if (!compared.length) {
    sameRunner.unavailable = !summary.valid
      ? 'The current sources did not pass collection in every round.'
      : 'The base sources did not pass collection in any round with the current fixture.';
    return summary;
  }
  // Raw base samples stay in each round's own report.
  const { samples, sources, ...pooledBase } = pool(
    compared.map((round) => base[round]!)
  );
  sameRunner.base = pooledBase;
  sameRunner.changeIntervals = Object.fromEntries(
    Object.keys(summary.metrics).flatMap((key) => {
      const interval = changeInterval(
        samples[key] ?? [],
        summary.samples[key] ?? [],
        key
      );
      return interval ? [[key, interval]] : [];
    })
  );
  return summary;
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const split = arg.indexOf('=');
      if (!arg.startsWith('--') || split === -1)
        throw new Error('Use --name=value arguments');
      return [arg.slice(2, split), arg.slice(split + 1)];
    })
  );
  const rounds = Number(args.rounds);
  if (!args.input || !args.output || !Number.isInteger(rounds) || rounds < 1)
    throw new Error('--input, --output and --rounds are required');
  const read = (side: string) =>
    Promise.all(
      Array.from({ length: rounds }, (_, round) =>
        readFile(
          path.join(
            args.input,
            `${side}-${round + 1}`,
            'report',
            'summary.json'
          ),
          'utf8'
        ).then(
          (text) => JSON.parse(text) as InputRecord,
          // A side that failed before reporting has no summary for that round.
          () => undefined
        )
      )
    );
  const summary = combine(await read('head'), await read('base'), {
    platform: args.platform,
    mode: args.mode,
    rounds,
    baseRevision: args.base,
    retried: (args.retried ?? '').split(',').filter(Boolean),
  });
  const comparison = sameRunnerBase(summary);
  await mkdir(args.output, { recursive: true });
  await writeFile(
    path.join(args.output, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n'
  );
  await writeFile(
    path.join(args.output, 'summary.md'),
    markdown(
      summary,
      comparison?.base,
      comparison?.note ??
        `No same-runner comparison. ${summary.sameRunner?.unavailable ?? ''}`.trim()
    )
  );
  if (!summary.valid) {
    console.error('Performance collection failed:');
    for (const error of summary.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
