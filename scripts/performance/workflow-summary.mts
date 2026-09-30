import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  baselineNote,
  createGitHubApi,
  findBaseline,
} from './post-comment.mts';
import { compatible } from './summary-table.mts';
import { markdown } from './report.mts';
import type { InputRecord } from './types.ts';

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
    const repository = process.env.GITHUB_REPOSITORY!;
    const api = createGitHubApi(repository, process.env.GITHUB_TOKEN!);
    const baseline = await findBaseline(
      api,
      'performance.yml',
      repository,
      Number(process.env.GITHUB_RUN_ID)
    );
    const candidate =
      baseline?.reports[
        `performance-summary-${summary.platform}-${summary.mode}`
      ];
    base = candidate;
    if (compatible(summary, candidate)) {
      note = baselineNote(baseline!, summary);
    } else {
      note =
        'No compatible baseline in the latest successful main report. Current readings remain available; older runs are not substituted.';
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
