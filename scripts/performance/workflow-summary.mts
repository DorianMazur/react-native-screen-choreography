import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGitHubApi, findBaseline } from './post-comment.mts';
import { compatible } from './summary-table.mts';
import { markdown } from './report.mts';
import type { InputRecord } from './types.ts';

/** PRs compare their exact base; pushes compare the branch tip before the push. */
export function baselineTarget(event: InputRecord) {
  if (event.pull_request?.base) return { base: event.pull_request.base };
  if (
    /^[a-f0-9]{40}$/.test(event.before ?? '') &&
    !/^0+$/.test(event.before) &&
    event.ref?.startsWith('refs/heads/')
  ) {
    return {
      base: { sha: event.before, ref: event.ref.slice('refs/heads/'.length) },
    };
  }
  return undefined;
}

async function main() {
  const output = process.env.PERFORMANCE_OUTPUT!;
  const reportPath = path.join(output, 'report', 'summary.json');
  let summary: Parameters<typeof markdown>[0];
  try {
    summary = JSON.parse(await readFile(reportPath, 'utf8'));
  } catch {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY!,
      'Performance collection did not produce a readable report. See build/test logs.\n'
    );
    return;
  }
  let base: InputRecord | undefined;
  let note = 'No compatible baseline available for this run.';
  try {
    const event = JSON.parse(
      await readFile(process.env.GITHUB_EVENT_PATH!, 'utf8')
    );
    const target = baselineTarget(event);
    if (!target) {
      note =
        'No baseline commit is defined for this event. Base and Change are unavailable.';
    } else {
      const repository = process.env.GITHUB_REPOSITORY!;
      const api = createGitHubApi(repository, process.env.GITHUB_TOKEN!);
      const baseline = await findBaseline(
        api,
        target,
        'performance.yml',
        repository
      );
      const candidate =
        baseline?.reports['performance-summary-android-native-release'];
      if (compatible(summary, candidate)) {
        base = candidate;
        note = `Base: [${baseline!.run.head_sha.slice(0, 7)}](https://github.com/${repository}/actions/runs/${baseline!.run.id}).`;
      } else {
        note =
          'No compatible baseline available at the exact comparison commit (missing, expired, failed, or incompatible report).';
      }
    }
  } catch {
    note = 'Baseline lookup failed. Current measurements remain available.';
  }
  const body = markdown(summary, base, note);
  await writeFile(path.join(output, 'report', 'summary.md'), body);
  await appendFile(process.env.GITHUB_STEP_SUMMARY!, body);
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
