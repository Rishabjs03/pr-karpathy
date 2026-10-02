/**
 * Loads a GitHub pull request: metadata, per-file patches, and full file contents.
 *
 * Full contents matter for accuracy. A diff shows the changed lines and three lines around
 * them; the model needs the rest of the file to know what a changed function's callers
 * expect. Contents are fetched only for files that pass the ignore list.
 */
import { Octokit } from '@octokit/rest';
import type { ChangeSet, FileContents } from '../changeset';
import { parseUnifiedDiff } from '../diff/parse';
import type { DiffFile } from '../diff/types';
import { UserError } from '../errors';
import type { SkippedFile } from '../schema/document';
import { mapWithConcurrency } from '../util/concurrency';
import type { LoadedSource } from './types';

export interface PullRequestReference {
  host: string;
  owner: string;
  repo: string;
  number: number;
}

export interface GitHubOptions {
  /** Token for private repositories and higher rate limits. Defaults to GITHUB_TOKEN. */
  token?: string;
  /** API base URL. Defaults to api.github.com, or https://<host>/api/v3 for GitHub Enterprise. */
  apiUrl?: string;
  /** Skip the contents of files larger than this many bytes. Default 400 KB. */
  maxContentBytes?: number;
  /** Concurrent content requests. Default 8. */
  concurrency?: number;
  /** Octokit instance, for tests. */
  octokit?: Octokit;
}

const PR_URL = /^https?:\/\/([^/\s]+)\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i;
const PR_SHORTHAND = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;

/**
 * Parses a PR URL (`https://github.com/owner/repo/pull/123`, including GitHub Enterprise
 * hosts and sub-pages such as `/files`) or the shorthand `owner/repo#123`.
 * Returns null when the text is not a PR reference.
 */
export function parsePullRequestReference(text: string): PullRequestReference | null {
  const trimmed = text.trim();
  const url = PR_URL.exec(trimmed);
  if (url) {
    return { host: url[1]!.toLowerCase(), owner: url[2]!, repo: url[3]!, number: Number(url[4]) };
  }
  const short = PR_SHORTHAND.exec(trimmed);
  if (short)
    return { host: 'github.com', owner: short[1]!, repo: short[2]!, number: Number(short[3]) };
  return null;
}

function apiBaseUrl(reference: PullRequestReference, override?: string): string {
  if (override) return override.replace(/\/+$/, '');
  return reference.host === 'github.com'
    ? 'https://api.github.com'
    : `https://${reference.host}/api/v3`;
}

function describeGitHubError(
  error: unknown,
  reference: PullRequestReference,
  hasToken: boolean,
): Error {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
  const name = `${reference.owner}/${reference.repo}#${reference.number}`;
  if (status === 404) {
    return new UserError(
      hasToken
        ? `Pull request ${name} was not found, or GITHUB_TOKEN cannot read it.`
        : `Pull request ${name} was not found. If the repository is private, set GITHUB_TOKEN.`,
      { cause: error },
    );
  }
  if (status === 401)
    return new UserError('GitHub rejected GITHUB_TOKEN (401). Check that it is valid.', {
      cause: error,
    });
  if (status === 403 || status === 429) {
    return new UserError(
      hasToken
        ? 'GitHub refused the request (rate limit or missing permission). Try again later.'
        : 'GitHub rate limit reached. Set GITHUB_TOKEN for a higher limit.',
      { cause: error },
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

type PullFile = Awaited<ReturnType<Octokit['rest']['pulls']['listFiles']>>['data'][number];

/** Converts one file from the GitHub API into a parsed diff file. */
export function diffFileFromGitHub(file: PullFile): DiffFile | SkippedFile | null {
  if (file.status === 'unchanged') return null;
  const kind =
    file.status === 'added' || file.status === 'copied'
      ? 'added'
      : file.status === 'removed'
        ? 'deleted'
        : file.status === 'renamed'
          ? 'renamed'
          : 'modified';

  const changedLines = file.additions + file.deletions;
  if (!file.patch) {
    // GitHub omits the patch for binary files and for very large diffs.
    if (changedLines > 0) return { file: file.filename, reason: 'too-large' };
    if (kind !== 'renamed') return { file: file.filename, reason: 'binary' };
  }

  // Parse the hunks with placeholder headers, then take the paths from the API, which are exact.
  const parsed = file.patch
    ? parseUnifiedDiff(`--- a/file\n+++ b/file\n${file.patch}\n`)[0]
    : undefined;
  const oldPath = kind === 'added' ? null : (file.previous_filename ?? file.filename);
  const newPath = kind === 'deleted' ? null : file.filename;
  return {
    path: file.filename,
    oldPath,
    newPath,
    kind,
    binary: false,
    hunks: parsed?.hunks ?? [],
    additions: parsed?.additions ?? file.additions,
    deletions: parsed?.deletions ?? file.deletions,
  };
}

function isSkipped(value: DiffFile | SkippedFile): value is SkippedFile {
  return 'reason' in value;
}

/** Loads a pull request from the GitHub API. */
export async function loadGitHubPullRequest(
  reference: PullRequestReference,
  options: GitHubOptions = {},
): Promise<LoadedSource> {
  const token = options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const octokit =
    options.octokit ??
    new Octokit({
      ...(token ? { auth: token } : {}),
      baseUrl: apiBaseUrl(reference, options.apiUrl ?? process.env.GITHUB_API_URL),
      userAgent: 'lucidiff',
      // Never log request details: they can contain the token.
      log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    });
  const { owner, repo, number } = reference;

  let pull: Awaited<ReturnType<Octokit['rest']['pulls']['get']>>['data'];
  let pullFiles: PullFile[];
  try {
    pull = (await octokit.rest.pulls.get({ owner, repo, pull_number: number })).data;
    pullFiles = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: number,
      per_page: 100,
    });
  } catch (error) {
    throw describeGitHubError(error, reference, Boolean(token));
  }

  const files: DiffFile[] = [];
  const skipped: SkippedFile[] = [];
  for (const file of pullFiles) {
    const converted = diffFileFromGitHub(file);
    if (!converted) continue;
    if (isSkipped(converted)) skipped.push(converted);
    else files.push(converted);
  }

  const changeSet: ChangeSet = {
    source: {
      kind: 'github',
      label: `${owner}/${repo}#${number}`,
      repository: `${owner}/${repo}`,
      base_ref: pull.base.ref,
      head_ref: pull.head.ref,
      author: pull.user?.login ? `@${pull.user.login}` : null,
    },
    pr: { url: pull.html_url, number, title: pull.title, description: pull.body ?? null },
    files,
    contents: new Map(),
    skipped,
  };

  const fetchContents = async (wanted: readonly DiffFile[]) => {
    // The PR diff is computed against the merge base, so read old files from there.
    let baseSha = pull.base.sha;
    try {
      const compare = await octokit.rest.repos.compareCommitsWithBasehead({
        owner,
        repo,
        basehead: `${pull.base.sha}...${pull.head.sha}`,
        per_page: 1,
      });
      baseSha = compare.data.merge_base_commit.sha;
    } catch {
      // Fall back to the base branch tip. Old line numbers may be slightly off.
    }

    const maxBytes = options.maxContentBytes ?? 400_000;
    const read = async (path: string, ref: string): Promise<string | null> => {
      try {
        const response = await octokit.rest.repos.getContent({
          owner,
          repo,
          path,
          ref,
          mediaType: { format: 'raw' },
        });
        const text = typeof response.data === 'string' ? response.data : null;
        return text !== null && Buffer.byteLength(text) <= maxBytes ? text : null;
      } catch {
        return null; // Context is optional; the diff alone still works.
      }
    };

    const contents = new Map<string, FileContents>();
    await mapWithConcurrency(wanted, options.concurrency ?? 8, async (file) => {
      const [base, head] = await Promise.all([
        file.oldPath ? read(file.oldPath, baseSha) : Promise.resolve(null),
        file.newPath ? read(file.newPath, pull.head.sha) : Promise.resolve(null),
      ]);
      if (base !== null || head !== null) contents.set(file.path, { base, head });
    });
    return contents;
  };

  return { changeSet, fetchContents };
}
