import {
  compatible,
  environmentChanges,
  summaryTable,
  firstRunTable,
  warmupNote,
  renderCountsTable,
} from './summary-table.mts';
import {
  readLatestHistory,
  newerRun,
  isMainRun,
  MAIN_BRANCH,
  SUMMARY_ARTIFACTS,
  type SavedRun,
} from './history.mts';
import type { InputRecord } from './types.ts';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const COMMENT_MARKER = '<!-- choreography-performance -->';
const ARTIFACTS = SUMMARY_ARTIFACTS;

const safe = (value: unknown) =>
  String(value)
    .slice(0, 220)
    .replaceAll('@', '&#64;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/[\r\n]/g, ' ')
    .replace(/[|`\\[\]]/g, (character) => `\\${character}`);

export function isCurrentPullRequest(
  pr: InputRecord,
  run: InputRecord,
  repository: string
) {
  return (
    pr.state === 'open' &&
    pr.base?.repo?.full_name === repository &&
    pr.head?.sha === run.head_sha
  );
}

/** One corrupt lane must not prevent a current-run comment for the other lanes. */
export async function readArtifactSummary(
  artifactName: string,
  loadSummary: () => Promise<InputRecord>
) {
  if (!ARTIFACTS.includes(artifactName))
    throw new Error('Unexpected summary artifact name');
  const [, platform, mode] =
    /^performance-summary-(android|ios)-(native-release)$/.exec(artifactName)!;
  try {
    const summary = await loadSummary();
    if (
      !summary ||
      typeof summary !== 'object' ||
      Array.isArray(summary) ||
      summary.schemaVersion !== 1 ||
      summary.platform !== platform ||
      summary.mode !== mode ||
      typeof summary.valid !== 'boolean'
    ) {
      throw new Error('Unsupported or mismatched summary schema');
    }
    return summary;
  } catch (error) {
    const reason = String(error instanceof Error ? error.message : error).slice(
      0,
      500
    );
    return {
      schemaVersion: 1,
      platform,
      mode,
      valid: false,
      metrics: {},
      errors: [`Summary artifact could not be read: ${reason}`],
    };
  }
}

function collectionStatus(
  report: InputRecord | undefined,
  platform: string,
  mode: string
) {
  if (!report) return 'missing';
  return report.schemaVersion === 1 &&
    report.platform === platform &&
    report.mode === mode &&
    report.valid === true
    ? 'passed'
    : 'failed';
}

export function renderComment(
  run: InputRecord,
  reports: Record<string, InputRecord>,
  baseline?: SavedRun
) {
  const lines = [
    COMMENT_MARKER,
    `<!-- choreography-run:${run.id}:${run.run_attempt ?? 1} -->`,
    '**Android and iOS performance**',
    '',
    `Run: **${safe(run.conclusion ?? 'unknown')}** · [reports and raw measurements](${run.html_url})`,
    '',
    `Android release: **${collectionStatus(reports[ARTIFACTS[0]], 'android', 'native-release')}** · iOS release: **${collectionStatus(reports[ARTIFACTS[1]], 'ios', 'native-release')}**`,
    '',
  ];
  for (const artifactName of ARTIFACTS) {
    const report = reports[artifactName];
    const label = artifactName.replace('performance-summary-', '');
    lines.push(
      `<details><summary>${label.startsWith('ios-') ? 'iOS' : 'Android'} release measurements · base comparison</summary>`,
      ''
    );
    if (!report) {
      lines.push('No validated summary was produced. Check the run logs.', '');
      lines.push('</details>', '');
      continue;
    }
    if (
      report.schemaVersion !== 1 ||
      report.mode !== label.replace(`${report.platform}-`, '') ||
      !label.startsWith(`${report.platform}-`)
    ) {
      lines.push('Unsupported or mismatched report; measurements omitted.', '');
      lines.push('</details>', '');
      continue;
    }
    if (report.valid !== true) {
      lines.push('**Collection failed; timings are incomplete.**', '');
      for (const error of (Array.isArray(report.errors)
        ? report.errors
        : []
      ).slice(0, 3)) {
        lines.push(`- ${safe(error)}`);
      }
      lines.push('');
      lines.push('</details>', '');
      continue;
    }
    const base = baseline?.reports[artifactName];
    lines.push(
      compatible(report, base)
        ? baselineNote(baseline!, report)
        : 'No compatible baseline in the latest successful main report. Current readings remain available; older runs are not substituted.',
      ''
    );
    lines.push(
      warmupNote(report),
      '',
      summaryTable(report, base),
      '',
      firstRunTable(report, base),
      ''
    );
    const renders = renderCountsTable(report, base);
    if (renders)
      lines.push(
        '<details><summary>Optional committed-render diagnostics</summary>',
        '',
        renders,
        '',
        '</details>',
        ''
      );
    lines.push('</details>', '');
  }
  lines.push(
    'Informational emulator/simulator results · medians · tap handler to UI motion, motion to endpoint, then UI input handoff (ms). Render changes are counts. [Full reports and measurements](' +
      run.html_url +
      ').'
  );
  return lines.join('\n');
}

export function selectBaselineRun(
  runs: InputRecord[],
  repository: string,
  excludeRunId?: number
) {
  return runs
    .filter(
      (candidate) =>
        isMainRun(candidate, repository) &&
        candidate.conclusion === 'success' &&
        candidate.id !== excludeRunId &&
        Number.isSafeInteger(candidate.id)
    )
    .sort((a, b) => b.id - a.id)[0];
}

export function createGitHubApi(repository: string, token: string) {
  const origin = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  return async (
    route: string,
    init: { method?: string; body?: string } = {}
  ) => {
    const response = await fetch(`${origin}/repos/${repository}${route}`, {
      ...init,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!response.ok)
      throw Object.assign(
        new Error(`GitHub API returned ${response.status} for ${route}`),
        { status: response.status }
      );
    return response;
  };
}

export async function loadReports(
  api: ReturnType<typeof createGitHubApi>,
  runId: number
) {
  const { artifacts } = await (
    await api(`/actions/runs/${runId}/artifacts?per_page=100`)
  ).json();
  const reports: Record<string, InputRecord> = {};
  const directory = await mkdtemp(path.join(tmpdir(), 'choreography-comment-'));
  try {
    for (const artifact of artifacts) {
      if (!ARTIFACTS.includes(artifact.name) || artifact.expired) continue;
      reports[artifact.name] = await readArtifactSummary(
        artifact.name,
        async () => {
          if (artifact.size_in_bytes > 2 * 1024 * 1024)
            throw new Error('Summary artifact exceeds size limit');
          const response = await api(`/actions/artifacts/${artifact.id}/zip`);
          const zip = path.join(directory, `${artifact.id}.zip`);
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length > 2 * 1024 * 1024)
            throw new Error('Summary download exceeds size limit');
          await writeFile(zip, bytes);
          const entries = execFileSync('unzip', ['-Z1', zip], {
            encoding: 'utf8',
            maxBuffer: 128 * 1024,
          })
            .trim()
            .split('\n');
          const allowed = entries.filter(
            (entry) =>
              entry === 'summary.json' || entry === 'report/summary.json'
          );
          if (allowed.length !== 1)
            throw new Error(
              'Artifact must contain exactly one recognized summary.json'
            );
          // Read one bounded JSON member directly. Never extract or execute PR artifact files.
          const text = execFileSync('unzip', ['-p', zip, allowed[0]], {
            encoding: 'utf8',
            maxBuffer: 2 * 1024 * 1024,
          });
          return JSON.parse(text);
        }
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  return reports;
}

export async function findBaseline(
  api: ReturnType<typeof createGitHubApi>,
  workflowId: number | string,
  repository: string,
  excludeRunId?: number
) {
  let baseline: SavedRun | undefined;
  try {
    baseline = await readLatestHistory(api, repository);
    if (baseline?.run.id === excludeRunId) baseline = undefined;
  } catch (error) {
    console.warn(`Performance history unavailable: ${String(error)}`);
  }
  try {
    const query = new URLSearchParams({
      status: 'success',
      branch: MAIN_BRANCH,
      per_page: '100',
    });
    const response = await (
      await api(`/actions/workflows/${workflowId}/runs?${query}`)
    ).json();
    const baseRun = selectBaselineRun(
      response.workflow_runs ?? [],
      repository,
      excludeRunId
    );
    if (baseRun && newerRun(baseRun, baseline?.run)) {
      baseline = { run: baseRun, reports: {} };
      baseline.reports = await loadReports(api, baseRun.id);
    }
  } catch (error) {
    console.warn(
      `Baseline unavailable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return baseline;
}

export function baselineNote(baseline: SavedRun, report: InputRecord) {
  const { run } = baseline;
  const url =
    baseline.reportUrl ??
    `https://github.com/${safe(run.repository.full_name)}/actions/runs/${run.id}`;
  return `Latest successful ${safe(run.head_branch)} report: [${safe(run.head_sha.slice(0, 7))}](${url}). ${environmentChanges(report, baseline.reports[`performance-summary-${report.platform}-${report.mode}`])}`.trim();
}

async function main() {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH ?? '', 'utf8')
  );
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? ''))
    throw new Error('Invalid repository context');
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Missing GitHub token');
  const api = createGitHubApi(repository, token);
  const requestedRunId = event.workflow_run?.id;
  if (!Number.isSafeInteger(requestedRunId))
    throw new Error('Missing workflow run ID');
  const run = await (await api(`/actions/runs/${requestedRunId}`)).json();
  if (
    run.name !== 'Performance' ||
    run.event !== 'pull_request' ||
    run.status !== 'completed' ||
    run.run_attempt !== event.workflow_run.run_attempt
  )
    return;
  if (run.repository?.full_name !== repository)
    throw new Error('Workflow repository mismatch');

  let candidates = run.pull_requests ?? [];
  if (!candidates.length) {
    candidates = await (
      await api(
        `/commits/${encodeURIComponent(run.head_sha)}/pulls?per_page=100`
      )
    ).json();
  }
  const current = [];
  for (const candidate of candidates) {
    if (!Number.isSafeInteger(candidate.number)) continue;
    const pr = await (await api(`/pulls/${candidate.number}`)).json();
    if (isCurrentPullRequest(pr, run, repository)) current.push(pr);
  }
  if (!current.length) return; // Never overwrite the current head with stale measurements.

  const reports = await loadReports(api, run.id);
  const latestRun = await (await api(`/actions/runs/${run.id}`)).json();
  if (
    latestRun.run_attempt !== run.run_attempt ||
    latestRun.status !== 'completed'
  )
    return;
  for (const pr of current) {
    const baseline = await findBaseline(api, run.workflow_id, repository);
    const body = renderComment(run, reports, baseline);
    // Both heads must still match after fetching artifacts.
    const latest = await (await api(`/pulls/${pr.number}`)).json();
    if (
      !isCurrentPullRequest(latest, run, repository) ||
      latest.base?.sha !== pr.base.sha ||
      latest.base?.ref !== pr.base.ref
    )
      continue;
    let previous;
    for (let page = 1; page <= 10 && !previous; page++) {
      const comments = await (
        await api(`/issues/${pr.number}/comments?per_page=100&page=${page}`)
      ).json();
      previous = comments.find(
        (comment: InputRecord) =>
          comment.user?.type === 'Bot' && comment.body?.includes(COMMENT_MARKER)
      );
      if (comments.length < 100) break;
    }
    if (previous) {
      if (previous.body === body) continue;
      const priorRun = previous.body.match(
        /<!-- choreography-run:(\d+):(\d+) -->/
      );
      if (
        priorRun &&
        (Number(priorRun[1]) > run.id ||
          (Number(priorRun[1]) === run.id &&
            Number(priorRun[2]) > (run.run_attempt ?? 1)))
      )
        continue;
      await api(`/issues/comments/${previous.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      });
    } else {
      await api(`/issues/${pr.number}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
    }
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
