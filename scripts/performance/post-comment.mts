import type { InputRecord } from './types.ts';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const COMMENT_MARKER = '<!-- choreography-performance -->';
const ARTIFACTS = [
  'performance-summary-android-native-release',
  'performance-summary-android-react-profile',
  'performance-summary-ios-native-release',
  'performance-summary-ios-react-profile',
];

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
    /^performance-summary-(android|ios)-(native-release|react-profile)$/.exec(
      artifactName
    )!;
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

export function renderComment(
  run: InputRecord,
  reports: Record<string, InputRecord>
) {
  const lines = [
    COMMENT_MARKER,
    `<!-- choreography-run:${run.id}:${run.run_attempt ?? 1} -->`,
    '## Choreography performance',
    '',
    `Run: **${safe(run.conclusion ?? 'unknown')}** · [reports and native traces](${run.html_url})`,
    '',
    'Hosted emulator/simulator results are informational. Release measurements and React profiling builds are separate.',
    '',
  ];
  for (const artifactName of ARTIFACTS) {
    const report = reports[artifactName];
    const label = artifactName.replace('performance-summary-', '');
    lines.push(`### ${label}`, '');
    if (!report) {
      lines.push('No validated summary was produced. Check the run logs.', '');
      continue;
    }
    if (
      report.schemaVersion !== 1 ||
      report.mode !== label.replace(`${report.platform}-`, '') ||
      !label.startsWith(`${report.platform}-`)
    ) {
      lines.push('Unsupported or mismatched report; measurements omitted.', '');
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
      continue;
    }
    lines.push(
      '| Metric (units in name) | Samples | Median | P95 |',
      '| --- | ---: | ---: | ---: |'
    );
    const selected = Object.entries(
      (report.metrics as Record<string, InputRecord>) ?? {}
    )
      .filter(([name]) =>
        /requestToSessionActiveMs|requestToSessionEndMs|requestToProbeHandlerMs|touchToAcknowledgementMs|renderWorkPerUpdateMs|committedUpdatesPerRun|sampledPeakPssKb|retainedPssDeltaKb|timeToInitialDisplayMs|timeToFullDisplayMs|frameOverrunMs|deadlineOverrunPercent|^ios\./.test(
          name
        )
      )
      .slice(0, 40);
    let shown = 0;
    for (const [name, metric] of selected) {
      if (
        !metric ||
        !Number.isInteger(metric.count) ||
        metric.count <= 0 ||
        typeof metric.median !== 'number' ||
        !Number.isFinite(metric.median) ||
        (metric.p95 !== null &&
          (typeof metric.p95 !== 'number' || !Number.isFinite(metric.p95)))
      )
        continue;
      const formatted = (number: number) =>
        Number(number.toFixed(3)).toString();
      lines.push(
        `| ${safe(name)} | ${metric.count} | ${formatted(metric.median)} | ${metric.p95 === null ? '—' : formatted(metric.p95)} |`
      );
      shown++;
    }
    if (!shown) lines.push('| No recognized measurements | — | — | — |');
    lines.push('');
  }
  lines.push(
    'React timings measure render work, not native commit duration. Session-active timing is a JS preparation proxy, not first presented motion. Request-to-probe includes test waiting and is a successful-input upper bound. Full-display timing ends at app-defined readiness, not verified input. Native input acknowledgments include queue effects; memory peaks are sampled. P95 is omitted for small samples.',
    '',
    'The complete summaries, raw samples, and traces are attached to the run. This comment updates on subsequent runs for the current PR head.'
  );
  return lines.join('\n');
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
  const origin = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const api = async (
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
      throw new Error(`GitHub API returned ${response.status} for ${route}`);
    return response;
  };
  const requestedRunId = event.workflow_run?.id;
  if (!Number.isSafeInteger(requestedRunId))
    throw new Error('Missing workflow run ID');
  const run = await (await api(`/actions/runs/${requestedRunId}`)).json();
  if (
    run.name !== 'Performance' ||
    run.event !== 'pull_request' ||
    run.status !== 'completed'
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

  const { artifacts } = await (
    await api(`/actions/runs/${run.id}/artifacts?per_page=100`)
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
  const body = renderComment(run, reports);
  for (const pr of current) {
    // Recheck after downloads: a new commit may have arrived during collection.
    if (
      !isCurrentPullRequest(
        await (await api(`/pulls/${pr.number}`)).json(),
        run,
        repository
      )
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
