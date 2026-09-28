import { readFile, appendFile } from 'node:fs/promises';
import { createGitHubApi, loadReports } from './post-comment.mts';
import { archiveRun, isMainRun } from './history.mts';

const event = JSON.parse(
  await readFile(process.env.GITHUB_EVENT_PATH!, 'utf8')
);
const repository = process.env.GITHUB_REPOSITORY!;
const api = createGitHubApi(repository, process.env.GITHUB_TOKEN!);
const id = event.workflow_run?.id;
if (!Number.isSafeInteger(id)) throw new Error('Missing workflow run ID');
const run = await (await api(`/actions/runs/${id}`)).json();
if (
  run.name !== 'Performance' ||
  !isMainRun(run, repository) ||
  run.run_attempt !== event.workflow_run.run_attempt
)
  throw new Error('Unsupported or superseded performance run');
const reports = await loadReports(api, id);
const latest = await (await api(`/actions/runs/${id}`)).json();
if (latest.run_attempt !== run.run_attempt || latest.status !== 'completed')
  throw new Error('Run changed while reading performance artifacts');
const url = await archiveRun(api, run, reports, repository);
await appendFile(
  process.env.GITHUB_STEP_SUMMARY!,
  `[Permanent performance report](${url})\n`
);
