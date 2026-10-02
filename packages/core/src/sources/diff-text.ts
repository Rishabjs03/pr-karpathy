import type { ChangeSet } from '../changeset';
import { parseUnifiedDiff } from '../diff/parse';
import { UserError } from '../errors';

/**
 * Builds a change set from raw unified diff text (stdin or a .diff/.patch file).
 *
 * A raw diff has no PR metadata and no full file contents, so the model only sees the hunks.
 *
 * @param diff - Unified diff text.
 * @param label - Where the diff came from, for display ("stdin" or a file name).
 * @throws {UserError} when the text contains no file changes.
 */
export function changeSetFromDiff(diff: string, label = 'stdin'): ChangeSet {
  const files = parseUnifiedDiff(diff);
  if (files.length === 0) {
    throw new UserError(
      `No file changes found in ${label}. Pass a unified diff, such as the output of "git diff".`,
    );
  }
  return {
    source: { kind: 'diff', label, repository: null, base_ref: null, head_ref: null, author: null },
    pr: null,
    files,
    contents: new Map(),
    skipped: [],
  };
}
