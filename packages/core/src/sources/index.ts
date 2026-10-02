import { UserError } from '../errors';
import { changeSetFromDiff } from './diff-text';
import { loadGitRange, type GitOptions } from './git';
import { loadGitHubPullRequest, parsePullRequestReference, type GitHubOptions } from './github';
import type { LoadedSource } from './types';

/** What to explain. */
export type ExplainInput =
  /** Unified diff text, for example from stdin or a .patch file. */
  | { kind: 'diff'; diff: string; label?: string }
  /** A GitHub pull request URL, or the shorthand "owner/repo#123". */
  | { kind: 'github'; url: string }
  /** A local git range. Empty means uncommitted changes. */
  | { kind: 'git'; range?: string; cwd?: string }
  /**
   * Bring your own source: a change set you built yourself, for integrations that already
   * have the diff and PR metadata (bots, CI jobs, other code hosts).
   */
  | { kind: 'loaded'; loaded: LoadedSource };

export interface SourceOptions {
  github?: GitHubOptions;
  git?: GitOptions;
}

/** Loads the input into a change set. */
export async function loadSource(
  input: ExplainInput,
  options: SourceOptions = {},
): Promise<LoadedSource> {
  switch (input.kind) {
    case 'diff':
      return { changeSet: changeSetFromDiff(input.diff, input.label) };
    case 'github': {
      const reference = parsePullRequestReference(input.url);
      if (!reference) {
        throw new UserError(
          `"${input.url}" is not a GitHub pull request URL. Expected https://github.com/owner/repo/pull/123.`,
        );
      }
      return loadGitHubPullRequest(reference, options.github);
    }
    case 'git':
      return loadGitRange(input.range, {
        ...options.git,
        ...(input.cwd ? { cwd: input.cwd } : {}),
      });
    case 'loaded':
      return input.loaded;
  }
}

export { changeSetFromDiff } from './diff-text';
export {
  loadGitRange,
  parseGitRange,
  repositoryFromRemote,
  type GitOptions,
  type GitRange,
} from './git';
export {
  diffFileFromGitHub,
  loadGitHubPullRequest,
  parsePullRequestReference,
  type GitHubOptions,
  type PullRequestReference,
} from './github';
export type { LoadedSource } from './types';
