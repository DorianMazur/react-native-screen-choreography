import { Buffer } from 'node:buffer';
import { markdown } from './report.mts';
import type { createGitHubApi } from './post-comment.mts';
import type { InputRecord } from './types.ts';

export const HISTORY_BRANCH = 'performance-history';
export const MAIN_BRANCH = 'main';
export const SUMMARY_ARTIFACT = 'performance-summary-android-native-release';
export const SUMMARY_ARTIFACTS = [
  SUMMARY_ARTIFACT,
  'performance-summary-ios-native-release',
];
type Api = ReturnType<typeof createGitHubApi>;
export type SavedRun = {
  run: InputRecord;
  reports: Record<string, InputRecord>;
  reportUrl?: string;
};

const LATEST_MAIN = 'latest-main.json';
const runPath = (run: InputRecord) => `runs/${run.id}/${run.run_attempt ?? 1}`;
export const historyUrl = (repository: string, run: InputRecord) =>
  `https://github.com/${repository}/blob/${HISTORY_BRANCH}/${runPath(run)}.md`;

export function newerRun(a: InputRecord, b?: InputRecord) {
  return (
    !b ||
    a.id > b.id ||
    (a.id === b.id && (a.run_attempt ?? 1) > (b.run_attempt ?? 1))
  );
}

export function isMainRun(run: InputRecord, repository: string) {
  return (
    ['push', 'workflow_dispatch'].includes(run.event) &&
    run.head_branch === MAIN_BRANCH &&
    run.status === 'completed' &&
    run.repository?.full_name === repository
  );
}

async function optionalJson(api: Api, route: string) {
  try {
    return await (await api(route)).json();
  } catch (error) {
    if ((error as { status?: number }).status === 404) return undefined;
    throw error;
  }
}

async function readJson(api: Api, file: string, ref = HISTORY_BRANCH) {
  const item = await optionalJson(
    api,
    `/contents/${file}?ref=${encodeURIComponent(ref)}`
  );
  if (!item) return undefined;
  if (
    item.encoding !== 'base64' ||
    item.size > 2 * 1024 * 1024 ||
    typeof item.content !== 'string'
  )
    throw new Error('Invalid performance history file');
  return JSON.parse(Buffer.from(item.content, 'base64').toString('utf8'));
}

export async function readLatestHistory(
  api: Api,
  repository: string
): Promise<SavedRun | undefined> {
  const latest = await readJson(api, LATEST_MAIN);
  if (!latest) return undefined;
  if (
    !Number.isSafeInteger(latest.id) ||
    latest.id <= 0 ||
    !Number.isSafeInteger(latest.run_attempt) ||
    latest.run_attempt < 1
  )
    throw new Error('Invalid performance baseline pointer');
  const saved = await readJson(api, `${runPath(latest)}.json`);
  if (
    !saved?.run ||
    !isMainRun(saved.run, repository) ||
    saved.run.conclusion !== 'success' ||
    saved.run.id !== latest.id ||
    saved.run.run_attempt !== latest.run_attempt ||
    !/^[a-f0-9]{40}$/.test(saved.run.head_sha) ||
    !saved.reports
  )
    throw new Error('Invalid performance baseline history');
  return { ...saved, reportUrl: historyUrl(repository, saved.run) };
}

/** Append a run and move the baseline pointer atomically; never delete old runs. */
export async function archiveRun(
  api: Api,
  run: InputRecord,
  reports: Record<string, InputRecord>,
  repository: string
) {
  if (
    !isMainRun(run, repository) ||
    !Number.isSafeInteger(run.id) ||
    run.id <= 0 ||
    !Number.isSafeInteger(run.run_attempt ?? 1) ||
    (run.run_attempt ?? 1) < 1 ||
    !/^[a-f0-9]{40}$/.test(run.head_sha)
  )
    throw new Error('Invalid performance run provenance');
  const saved: SavedRun = {
    run: {
      id: run.id,
      run_attempt: run.run_attempt ?? 1,
      event: run.event,
      status: run.status,
      conclusion: run.conclusion,
      head_sha: run.head_sha,
      head_branch: run.head_branch,
      created_at: run.created_at,
      html_url: run.html_url,
      repository: { full_name: repository },
    },
    reports,
  };
  const content = JSON.stringify(saved, null, 2) + '\n';
  if (Buffer.byteLength(content) > 900 * 1024)
    throw new Error('Archived report exceeds size limit');
  const summaries = SUMMARY_ARTIFACTS.map(
    (artifact) =>
      reports[artifact] ?? {
        platform: artifact.includes('-ios-') ? 'ios' : 'android',
        mode: 'native-release',
        valid: false,
        errors: ['No validated summary was produced. Check the run logs.'],
      }
  );
  const body = [
    ...summaries.map((report) =>
      markdown(report, undefined, 'Saved main-branch readings.')
    ),
    `Commit: \`${run.head_sha}\` · Run: ${run.id}, attempt ${run.run_attempt ?? 1}.`,
    '',
    `[Saved readings, definitions, and environment](${run.run_attempt ?? 1}.json)`,
    '',
  ].join('\n');
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await optionalJson(api, `/git/ref/heads/${HISTORY_BRANCH}`);
    const parent = ref?.object?.sha;
    if (parent && (await readJson(api, `${runPath(run)}.json`, parent)))
      return historyUrl(repository, run);
    const commit = parent
      ? await (await api(`/git/commits/${parent}`)).json()
      : undefined;
    const latest = parent
      ? await readJson(api, LATEST_MAIN, parent)
      : undefined;
    const files = [
      { path: `${runPath(run)}.json`, content },
      { path: `${runPath(run)}.md`, content: body },
    ];
    if (!parent)
      files.push({
        path: 'README.md',
        content:
          '# Performance history\n\nMain-branch reports and sample readings are retained without automatic expiry in [runs](runs/). Each run and attempt is immutable. [latest-main.json](latest-main.json) identifies the latest successful main run. PR and other-branch reports, raw device exports, and logs remain temporary Actions artifacts.\n',
      });
    if (
      run.conclusion === 'success' &&
      summaries.every((report) => report.valid === true) &&
      newerRun(run, latest)
    )
      files.push({
        path: LATEST_MAIN,
        content:
          JSON.stringify({ id: run.id, run_attempt: run.run_attempt ?? 1 }) +
          '\n',
      });
    const tree = await (
      await api('/git/trees', {
        method: 'POST',
        body: JSON.stringify({
          ...(commit ? { base_tree: commit.tree.sha } : {}),
          tree: files.map((file) => ({
            ...file,
            mode: '100644',
            type: 'blob',
          })),
        }),
      })
    ).json();
    const next = await (
      await api('/git/commits', {
        method: 'POST',
        body: JSON.stringify({
          message: `Archive performance run ${run.id}/${run.run_attempt ?? 1}`,
          tree: tree.sha,
          parents: parent ? [parent] : [],
        }),
      })
    ).json();
    try {
      await api(parent ? `/git/refs/heads/${HISTORY_BRANCH}` : '/git/refs', {
        method: parent ? 'PATCH' : 'POST',
        body: JSON.stringify(
          parent
            ? { sha: next.sha, force: false }
            : { ref: `refs/heads/${HISTORY_BRANCH}`, sha: next.sha }
        ),
      });
      return historyUrl(repository, run);
    } catch (error) {
      if (
        attempt === 2 ||
        ![409, 422].includes((error as { status: number }).status)
      )
        throw error;
    }
  }
  throw new Error('Unable to append performance history');
}
