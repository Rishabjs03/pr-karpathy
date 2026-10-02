import type { DiffFile } from './types';

export interface LineRange {
  start: number;
  end: number;
}

/**
 * Returns the line ranges that a file's hunks cover on one side of the diff, widened by
 * `margin` lines and merged where they overlap.
 *
 * Hunks already include a few lines of unchanged context around each change. The margin adds
 * a little more, so a citation of the line just above a hunk still counts as "adjacent".
 */
export function changedLineRanges(
  file: DiffFile,
  side: 'new' | 'old',
  margin: number,
): LineRange[] {
  const ranges: LineRange[] = [];
  for (const hunk of file.hunks) {
    const start = side === 'new' ? hunk.newStart : hunk.oldStart;
    const count = side === 'new' ? hunk.newLines : hunk.oldLines;
    // A hunk with zero lines on this side marks a position, not a range.
    const end = count > 0 ? start + count - 1 : start;
    ranges.push({ start: Math.max(1, start - margin), end: end + margin });
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: LineRange[] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end + 1) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}
