/**
 * Risk citation validation: the check that keeps the risk list trustworthy.
 *
 * The model must cite a file and a line range for every risk. This module drops any risk
 * whose citation does not hold up: the file is not in the PR, the lines are outside the
 * changed hunks, or the range is so wide that it points at nothing in particular.
 * Dropping is the right default. A missing risk costs the reviewer little; a wrong citation
 * teaches them to stop trusting the list.
 */
import { changedLineRanges } from '../diff/ranges';
import type { DocumentRisk } from '../schema/document';
import type { LlmRisk } from '../schema/llm';
import { stableId } from './ids';
import type { FileIndex } from './paths';

export interface CitationOptions {
  /** Lines of slack around each hunk that still count as "adjacent". Default 5. */
  margin?: number;
  /** Widest accepted range, in lines. Wider citations are too vague to act on. Default 80. */
  maxSpan?: number;
}

export interface DroppedRisk {
  risk: LlmRisk;
  reason: string;
}

export interface CitationResult {
  risks: DocumentRisk[];
  dropped: DroppedRisk[];
}

/** Shortest reason we accept. Anything shorter cannot describe a mechanism. */
const MIN_REASON_LENGTH = 24;

/**
 * Validates each risk's file and line citation against the diff.
 *
 * Kept risks get canonical paths, integer line numbers, and a stable id. Duplicates are
 * merged. The order of kept risks follows the model's order.
 */
export function validateRiskCitations(
  risks: readonly LlmRisk[],
  index: FileIndex,
  options: CitationOptions = {},
): CitationResult {
  const margin = options.margin ?? 5;
  const maxSpan = options.maxSpan ?? 80;
  const kept: DocumentRisk[] = [];
  const dropped: DroppedRisk[] = [];
  const seen = new Set<string>();

  for (const risk of risks) {
    const drop = (reason: string) => dropped.push({ risk, reason });
    const file = index.find(risk.file);
    if (!file) {
      drop(`"${risk.file}" is not a file in this diff`);
      continue;
    }
    if (file.binary) {
      drop(`"${file.path}" is a binary file`);
      continue;
    }

    // Deleted files only have old lines and added files only have new lines.
    const side = file.kind === 'deleted' ? 'old' : file.kind === 'added' ? 'new' : risk.side;
    const a = Math.round(risk.start_line);
    const b = Math.round(risk.end_line);
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    if (!Number.isFinite(start) || start < 1) {
      drop(`line ${start} is not a valid line number`);
      continue;
    }
    if (end - start + 1 > maxSpan) {
      drop(`lines ${start}-${end} span more than ${maxSpan} lines`);
      continue;
    }
    const ranges = changedLineRanges(file, side, margin);
    const overlaps = ranges.some((range) => start <= range.end && end >= range.start);
    if (!overlaps) {
      drop(`${side} lines ${start}-${end} of ${file.path} are outside the changed hunks`);
      continue;
    }

    const reason = risk.reason.trim();
    if (reason.length < MIN_REASON_LENGTH) {
      drop('the reason is too short to describe a concrete mechanism');
      continue;
    }

    const path = side === 'old' ? (file.oldPath ?? file.path) : (file.newPath ?? file.path);
    const title = risk.title.trim() || reason.split(/\s+/).slice(0, 8).join(' ');
    const key = `${path}:${side}:${start}-${end}:${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    kept.push({
      id: stableId('r', path, side, start, end, title),
      severity: risk.severity,
      title,
      file: path,
      side,
      lines: [start, end],
      reason,
    });
  }
  return { risks: kept, dropped };
}
