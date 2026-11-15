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

/**
 * The current side's pooled report, carrying the base side measured in the same
 * session. A base that could not be measured leaves the report itself intact.
 */
export function combine(
  head: InputRecord[],
  base: InputRecord[],
  info: { platform: string; mode: string; rounds: number; baseRevision: string }
): InputRecord {
  if (!head.length)
    return {
      schemaVersion: 1,
      platform: info.platform,
      mode: info.mode,
      valid: false,
      metrics: {},
      errors: ['No A/B round produced a report for the current sources.'],
    };
  const summary = pool(head);
  if (head.length < info.rounds) {
    summary.valid = false;
    summary.errors.push(
      `Only ${head.length} of ${info.rounds} A/B rounds produced a report for the current sources.`
    );
  }
  const sameRunner: InputRecord = {
    baseRevision: info.baseRevision,
    rounds: info.rounds,
  };
  summary.sameRunner = sameRunner;
  if (
    !summary.valid ||
    base.length < info.rounds ||
    !base.every((round) => round.valid === true)
  ) {
    sameRunner.unavailable = !summary.valid
      ? 'The current sources did not pass collection in every round.'
      : 'The base sources did not pass collection in every round with the current fixture.';
    return summary;
  }
  // Raw base samples stay in each round's own report.
  const { samples, sources, ...pooledBase } = pool(base);
  sameRunner.base = pooledBase;
  sameRunner.roundMedians = Object.fromEntries(
    Object.keys(summary.metrics).flatMap((key) => {
      const pairs = head.map((round, index) => [
        base[index]!.metrics?.[key]?.median,
        round.metrics?.[key]?.median,
      ]);
      return pairs.every((pair) =>
        pair.every((median) => typeof median === 'number')
      )
        ? [[key, pairs]]
        : [];
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
  const read = async (side: string) => {
    const reports: InputRecord[] = [];
    for (let round = 1; round <= rounds; round++) {
      try {
        reports.push(
          JSON.parse(
            await readFile(
              path.join(
                args.input,
                `${side}-${round}`,
                'report',
                'summary.json'
              ),
              'utf8'
            )
          )
        );
      } catch {
        // A side that failed before reporting has no summary for that round.
      }
    }
    return reports;
  };
  const summary = combine(await read('head'), await read('base'), {
    platform: args.platform,
    mode: args.mode,
    rounds,
    baseRevision: args.base,
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
