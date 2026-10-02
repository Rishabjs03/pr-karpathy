import { describe, expect, it, vi } from 'vitest';
import type { Octokit } from '@octokit/rest';
import {
  diffFileFromGitHub,
  loadGitHubPullRequest,
  parsePullRequestReference,
  UserError,
} from '../src';

describe('parsePullRequestReference', () => {
  it.each([
    [
      'https://github.com/acme/api/pull/42',
      { host: 'github.com', owner: 'acme', repo: 'api', number: 42 },
    ],
    [
      'https://github.com/acme/api/pull/42/files',
      { host: 'github.com', owner: 'acme', repo: 'api', number: 42 },
    ],
    [
      'https://github.com/acme/api/pull/42#discussion_r1',
      { host: 'github.com', owner: 'acme', repo: 'api', number: 42 },
    ],
    [
      'http://GitHub.example.com/team/svc/pull/7',
      { host: 'github.example.com', owner: 'team', repo: 'svc', number: 7 },
    ],
    ['acme/api#42', { host: 'github.com', owner: 'acme', repo: 'api', number: 42 }],
    ['  acme/my.repo#1  ', { host: 'github.com', owner: 'acme', repo: 'my.repo', number: 1 }],
  ])('parses %s', (text, expected) => {
    expect(parsePullRequestReference(text)).toEqual(expected);
  });

  it.each([
    'https://github.com/acme/api/issues/42',
    'https://github.com/acme/api',
    'acme/api',
    'diff.patch',
    '',
  ])('rejects %s', (text) => {
    expect(parsePullRequestReference(text)).toBeNull();
  });
});

const patch = '@@ -1,2 +1,3 @@\n line one\n-line two\n+line 2\n+line three';

describe('diffFileFromGitHub', () => {
  const base = { sha: 'x', blob_url: '', raw_url: '', contents_url: '', changes: 0 };

  it('converts a modified file with exact line numbers', () => {
    const file = diffFileFromGitHub({
      ...base,
      filename: 'src/a.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      patch,
    } as never);
    expect(file).toMatchObject({
      path: 'src/a.ts',
      oldPath: 'src/a.ts',
      newPath: 'src/a.ts',
      kind: 'modified',
      additions: 2,
      deletions: 1,
    });
    expect((file as { hunks: { lines: unknown[] }[] }).hunks[0]!.lines).toHaveLength(4);
  });

  it('maps statuses to change kinds', () => {
    const kind = (status: string, extra = {}) =>
      (
        diffFileFromGitHub({
          ...base,
          filename: 'f',
          status,
          additions: 1,
          deletions: 0,
          patch: '@@ -0,0 +1 @@\n+x',
          ...extra,
        } as never) as { kind: string }
      ).kind;
    expect(kind('added')).toBe('added');
    expect(kind('removed')).toBe('deleted');
    expect(kind('renamed', { previous_filename: 'old' })).toBe('renamed');
    expect(kind('copied')).toBe('added');
    expect(kind('changed')).toBe('modified');
  });

  it('keeps the previous path of a renamed file', () => {
    const file = diffFileFromGitHub({
      ...base,
      filename: 'new.ts',
      previous_filename: 'old.ts',
      status: 'renamed',
      additions: 0,
      deletions: 0,
    } as never);
    expect(file).toMatchObject({ path: 'new.ts', oldPath: 'old.ts', kind: 'renamed', hunks: [] });
  });

  it('marks files without a patch as binary or too large', () => {
    expect(
      diffFileFromGitHub({
        ...base,
        filename: 'a.png',
        status: 'modified',
        additions: 0,
        deletions: 0,
      } as never),
    ).toEqual({ file: 'a.png', reason: 'binary' });
    expect(
      diffFileFromGitHub({
        ...base,
        filename: 'big.sql',
        status: 'modified',
        additions: 90000,
        deletions: 0,
      } as never),
    ).toEqual({ file: 'big.sql', reason: 'too-large' });
  });
});

function fakeOctokit(options: { status?: number } = {}) {
  const getContent = vi.fn(async ({ path, ref }: { path: string; ref: string }) => ({
    data: `// ${path} at ${ref}\n`,
  }));
  const octokit = {
    rest: {
      pulls: {
        get: vi.fn(async () => {
          if (options.status)
            throw Object.assign(new Error('HttpError'), { status: options.status });
          return {
            data: {
              title: 'Add retries',
              body: 'Retries failed jobs.',
              html_url: 'https://github.com/acme/api/pull/42',
              user: { login: 'octocat' },
              base: { ref: 'main', sha: 'base-tip' },
              head: { ref: 'feat/retry', sha: 'head-sha' },
            },
          };
        }),
        listFiles: vi.fn(),
      },
      repos: {
        compareCommitsWithBasehead: vi.fn(async () => ({
          data: { merge_base_commit: { sha: 'merge-base' } },
        })),
        getContent,
      },
    },
    paginate: vi.fn(async () => [
      {
        filename: 'src/retry.ts',
        status: 'added',
        additions: 1,
        deletions: 0,
        patch: '@@ -0,0 +1 @@\n+export const retry = 1;',
      },
      {
        filename: 'src/old.ts',
        status: 'removed',
        additions: 0,
        deletions: 1,
        patch: '@@ -1 +0,0 @@\n-export const old = 1;',
      },
      { filename: 'src/jobs.ts', status: 'modified', additions: 2, deletions: 1, patch },
      { filename: 'logo.png', status: 'modified', additions: 0, deletions: 0 },
    ]),
  };
  return { octokit: octokit as unknown as Octokit, getContent };
}

const reference = { host: 'github.com', owner: 'acme', repo: 'api', number: 42 };

describe('loadGitHubPullRequest', () => {
  it('loads metadata and files', async () => {
    const { octokit } = fakeOctokit();
    const { changeSet } = await loadGitHubPullRequest(reference, { octokit });
    expect(changeSet.source).toEqual({
      kind: 'github',
      label: 'acme/api#42',
      repository: 'acme/api',
      base_ref: 'main',
      head_ref: 'feat/retry',
      author: '@octocat',
    });
    expect(changeSet.pr).toEqual({
      url: 'https://github.com/acme/api/pull/42',
      number: 42,
      title: 'Add retries',
      description: 'Retries failed jobs.',
    });
    expect(changeSet.files.map((file) => [file.path, file.kind])).toEqual([
      ['src/retry.ts', 'added'],
      ['src/old.ts', 'deleted'],
      ['src/jobs.ts', 'modified'],
    ]);
    expect(changeSet.skipped).toEqual([{ file: 'logo.png', reason: 'binary' }]);
  });

  it('reads old contents at the merge base and new contents at the head', async () => {
    const { octokit, getContent } = fakeOctokit();
    const { changeSet, fetchContents } = await loadGitHubPullRequest(reference, { octokit });
    const contents = await fetchContents!(changeSet.files);
    expect(contents.get('src/jobs.ts')).toEqual({
      base: '// src/jobs.ts at merge-base\n',
      head: '// src/jobs.ts at head-sha\n',
    });
    expect(contents.get('src/retry.ts')).toEqual({
      base: null,
      head: '// src/retry.ts at head-sha\n',
    });
    expect(contents.get('src/old.ts')).toEqual({
      base: '// src/old.ts at merge-base\n',
      head: null,
    });
    expect(getContent).toHaveBeenCalledTimes(4);
  });

  it('only fetches contents for the files it is given', async () => {
    const { octokit, getContent } = fakeOctokit();
    const { changeSet, fetchContents } = await loadGitHubPullRequest(reference, { octokit });
    await fetchContents!(changeSet.files.slice(0, 1));
    expect(getContent).toHaveBeenCalledTimes(1);
  });

  it.each([
    [404, /not found\. If the repository is private, set GITHUB_TOKEN/],
    [401, /rejected GITHUB_TOKEN/],
    [403, /rate limit/],
  ])('explains HTTP %s errors', async (status, message) => {
    const { octokit } = fakeOctokit({ status });
    const promise = loadGitHubPullRequest(reference, { octokit, token: '' });
    await expect(promise).rejects.toBeInstanceOf(UserError);
    await expect(loadGitHubPullRequest(reference, { octokit, token: '' })).rejects.toThrow(message);
  });
});
