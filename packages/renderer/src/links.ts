/**
 * Links into the GitHub pull request "Files changed" view.
 *
 * GitHub anchors each file as `#diff-<sha256 of the path>` and each line as a suffix:
 * `R<line>` for the new version and `L<line>` for the old one. A range is `R12-R18`.
 */
import { createHash } from 'node:crypto';
import type { LineSide } from '@lucidiff/core/schema';

/** Normalizes any GitHub PR URL (including `/files` or `/commits` views) to its base URL. */
export function normalizePrUrl(prUrl: string): string | null {
  const match = /^(https?:\/\/[^/]+\/[^/]+\/[^/]+\/pull\/\d+)/i.exec(prUrl);
  return match?.[1] ?? null;
}

function fileAnchor(path: string): string {
  return `diff-${createHash('sha256').update(path).digest('hex')}`;
}

/** URL of a file in the PR's "Files changed" view, or null when the PR URL is unknown. */
export function prFileUrl(prUrl: string | null, path: string): string | null {
  const base = prUrl ? normalizePrUrl(prUrl) : null;
  return base ? `${base}/files#${fileAnchor(path)}` : null;
}

/** URL of a line range in the PR's "Files changed" view, or null when the PR URL is unknown. */
export function prLineUrl(
  prUrl: string | null,
  path: string,
  side: LineSide,
  [start, end]: readonly [number, number],
): string | null {
  const fileUrl = prFileUrl(prUrl, path);
  if (!fileUrl) return null;
  const prefix = side === 'new' ? 'R' : 'L';
  const range = start === end ? `${prefix}${start}` : `${prefix}${start}-${prefix}${end}`;
  return `${fileUrl}${range}`;
}
