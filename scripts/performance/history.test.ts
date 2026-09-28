import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import {
  archiveRun,
  HISTORY_BRANCH,
  readLatestHistory,
  SUMMARY_ARTIFACT,
} from './history.mts';
import { findBaseline } from './post-comment.mts';
import { markdown } from './report.mts';
import type { InputRecord } from './types.ts';

const run = {
  id: 10,
  run_attempt: 1,
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  head_sha: 'a'.repeat(40),
  head_branch: 'main',
  repository: { full_name: 'owner/repo' },
};
const reports = {
  [SUMMARY_ARTIFACT]: {
    schemaVersion: 1,
    platform: 'android',
    mode: 'native-release',
    valid: true,
    metrics: {},
    samples: { reading: [1, 2, 3] },
  },
};

function github() {
  let head: string | undefined;
  let next = 0;
  const trees = new Map<string, Record<string, string>>();
  const commits = new Map<string, InputRecord>();
  const writes: string[] = [];
  const api = async (
    route: string,
    init: { method?: string; body?: string } = {}
  ) => {
    const body = init.body ? JSON.parse(init.body) : {};
    const respond = (data: unknown) => new Response(JSON.stringify(data));
    const missing = () => {
      throw Object.assign(new Error('not found'), { status: 404 });
    };
    if (init.method) writes.push(route);
    if (route.startsWith('/contents/')) {
      const file = route.slice('/contents/'.length).split('?')[0];
      const ref = new URLSearchParams(route.split('?')[1]).get('ref');
      const sha = ref === HISTORY_BRANCH ? head : ref;
      const content = sha
        ? trees.get(commits.get(sha)?.tree.sha)?.[file]
        : undefined;
      return content === undefined
        ? missing()
        : respond({
            encoding: 'base64',
            size: Buffer.byteLength(content),
            content: Buffer.from(content).toString('base64'),
          });
    }
    if (route.startsWith('/git/ref/'))
      return head ? respond({ object: { sha: head } }) : missing();
    if (route.startsWith('/git/commits/'))
      return respond(commits.get(route.split('/').at(-1)!));
    if (route === '/git/trees') {
      const sha = `tree-${++next}`;
      trees.set(sha, {
        ...(trees.get(body.base_tree) ?? {}),
        ...Object.fromEntries(
          body.tree.map((file: InputRecord) => [file.path, file.content])
        ),
      });
      return respond({ sha });
    }
    if (route === '/git/commits') {
      const sha = `commit-${++next}`;
      commits.set(sha, { tree: { sha: body.tree }, parents: body.parents });
      return respond({ sha });
    }
    if (route.startsWith('/git/refs')) {
      assert.ok(
        body.force === false || body.ref === `refs/heads/${HISTORY_BRANCH}`
      );
      if (
        head &&
        (init.method === 'POST' || commits.get(body.sha)?.parents[0] !== head)
      )
        throw Object.assign(new Error('reference advanced concurrently'), {
          status: 422,
        });
      head = body.sha;
      return respond({});
    }
    if (route.startsWith('/actions/workflows/'))
      return respond({ workflow_runs: [] });
    throw new Error(`Unexpected route: ${route}`);
  };
  return { api, writes, files: () => trees.get(commits.get(head!)!.tree.sha)! };
}

test('archives immutable readings, preserves old runs, and never lets a late run move the baseline backwards', async () => {
  const { api, writes, files } = github();
  await archiveRun(api, run, reports, 'owner/repo');
  const saved = files()['runs/10/1.json'];
  const count = writes.length;
  await archiveRun(api, run, reports, 'owner/repo');
  assert.equal(writes.length, count);
  await archiveRun(api, { ...run, id: 20 }, reports, 'owner/repo');
  await archiveRun(api, { ...run, id: 5 }, reports, 'owner/repo');
  assert.equal(files()['runs/10/1.json'], saved);
  assert.deepEqual(
    JSON.parse(saved).reports[SUMMARY_ARTIFACT].samples.reading,
    [1, 2, 3]
  );
  assert.equal((await readLatestHistory(api, 'owner/repo'))!.run.id, 20);
  assert.deepEqual(JSON.parse(files()['latest-main.json']), {
    id: 20,
    run_attempt: 1,
  });
  assert.equal(JSON.parse(saved).comparison, undefined);
  assert.ok(
    Object.keys(files()).every((file) => !file.startsWith('branches/'))
  );
});

test('PRs and other branches cannot write permanent history', async () => {
  const { api, writes } = github();
  for (const changed of [
    { event: 'pull_request' },
    { event: 'pull_request', head_branch: 'feature' },
    { head_branch: 'feature' },
    { event: 'workflow_dispatch', head_branch: 'feature' },
    { repository: { full_name: 'fork/repo' } },
  ]) {
    await assert.rejects(
      archiveRun(api, { ...run, ...changed }, reports, 'owner/repo'),
      /provenance/
    );
  }
  assert.deepEqual(writes, []);
});

test('manual main runs and newer attempts can advance the baseline', async () => {
  const { api, files } = github();
  await archiveRun(api, run, reports, 'owner/repo');
  await archiveRun(
    api,
    { ...run, id: 20, event: 'workflow_dispatch', run_attempt: 2 },
    reports,
    'owner/repo'
  );
  await archiveRun(
    api,
    { ...run, id: 20, event: 'workflow_dispatch' },
    reports,
    'owner/repo'
  );
  assert.ok(files()['runs/20/1.json']);
  const latest = await readLatestHistory(api, 'owner/repo');
  assert.equal(latest!.run.id, 20);
  assert.equal(latest!.run.run_attempt, 2);
});

test('archives only repository identity and uses the shared full report formatter', async () => {
  const { api, files } = github();
  await archiveRun(
    api,
    { ...run, repository: { ...run.repository, description: 'Not needed' } },
    reports,
    'owner/repo'
  );
  assert.deepEqual(JSON.parse(files()['runs/10/1.json']).run.repository, {
    full_name: 'owner/repo',
  });
  assert.ok(
    files()['runs/10/1.md'].startsWith(
      markdown(
        reports[SUMMARY_ARTIFACT],
        undefined,
        'Saved main-branch readings.'
      )
    )
  );
  const failed = {
    ...reports[SUMMARY_ARTIFACT],
    valid: false,
    errors: ['Missing detail render observations'],
  };
  await archiveRun(
    api,
    { ...run, id: 20, conclusion: 'failure' },
    { [SUMMARY_ARTIFACT]: failed },
    'owner/repo'
  );
  assert.match(files()['runs/20/1.md'], /Missing detail render observations/);
});

test('history remains a usable baseline after Actions run records and artifacts expire', async () => {
  const { api } = github();
  await archiveRun(api, run, reports, 'owner/repo');
  const baseline = await findBaseline(api, 'performance.yml', 'owner/repo');
  assert.equal(baseline!.run.id, 10);
  assert.match(baseline!.reportUrl!, /performance-history\/runs\/10\/1.md$/);
  assert.deepEqual(
    (await readLatestHistory(api, 'owner/repo'))!.reports,
    reports
  );
  await assert.rejects(
    readLatestHistory(api, 'other/repo'),
    /baseline history/
  );
});

test('concurrent archives retry without losing either report or the newer baseline', async () => {
  const { api, files } = github();
  await Promise.all([
    archiveRun(api, run, reports, 'owner/repo'),
    archiveRun(api, { ...run, id: 20 }, reports, 'owner/repo'),
  ]);
  assert.ok(files()['runs/10/1.json']);
  assert.ok(files()['runs/20/1.json']);
  assert.equal((await readLatestHistory(api, 'owner/repo'))!.run.id, 20);
});

test('a missing latest-run artifact never silently substitutes an older archived baseline', async () => {
  const { api } = github();
  await archiveRun(api, run, reports, 'owner/repo');
  for (const fails of [false, true]) {
    const withNewRun: typeof api = async (route, init) => {
      if (route.startsWith('/actions/workflows/'))
        return new Response(
          JSON.stringify({ workflow_runs: [{ ...run, id: 20 }] })
        );
      if (route.startsWith('/actions/runs/20/artifacts')) {
        if (fails) throw new Error('Artifact lookup failed');
        return new Response(JSON.stringify({ artifacts: [] }));
      }
      return api(route, init);
    };
    const baseline = await findBaseline(
      withNewRun,
      'performance.yml',
      'owner/repo'
    );
    assert.equal(baseline!.run.id, 20);
    assert.deepEqual(baseline!.reports, {});
  }
});

test('failed and malformed runs never replace a successful baseline', async () => {
  const { api, files } = github();
  await archiveRun(api, run, reports, 'owner/repo');
  await archiveRun(
    api,
    { ...run, id: 20, conclusion: 'failure' },
    {},
    'owner/repo'
  );
  assert.equal((await readLatestHistory(api, 'owner/repo'))!.run.id, 10);
  assert.match(files()['runs/20/1.md'], /No validated summary was produced/);
  await assert.rejects(
    archiveRun(api, { ...run, id: '../escape' }, reports, 'owner/repo'),
    /provenance/
  );
});

test('latest pointers must resolve to their own main-branch run', async () => {
  const { api } = github();
  await archiveRun(api, run, reports, 'owner/repo');
  for (const pointer of [
    { id: '../escape', run_attempt: 1 },
    { id: 10, run_attempt: 0 },
    { id: 20, run_attempt: 1 },
  ]) {
    const corrupted: typeof api = async (route, init) => {
      if (route.startsWith('/contents/latest-main.json?')) {
        const content = JSON.stringify(pointer);
        return new Response(
          JSON.stringify({
            encoding: 'base64',
            size: Buffer.byteLength(content),
            content: Buffer.from(content).toString('base64'),
          })
        );
      }
      return api(route, init);
    };
    await assert.rejects(
      readLatestHistory(corrupted, 'owner/repo'),
      /baseline/
    );
  }
});
