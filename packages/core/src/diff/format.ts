/**
 * Formats diffs and file contents for the model.
 *
 * Each diff line carries its old and new line number in fixed columns, so the model can cite
 * exact lines without counting:
 *
 *    OLD   NEW
 *     10    10    unchanged line
 *     11       -  removed line
 *           11 +  added line
 *
 * The system prompt explains this format. Keep the two in sync.
 */
import type { DiffFile } from './types';

const COLUMN = 5;

function column(value: number | null): string {
  return (value === null ? '' : String(value)).padStart(COLUMN);
}

/** One-line description of a file change, e.g. "src/a.ts (renamed from src/b.ts, +3 -1)". */
export function describeFile(file: DiffFile): string {
  const kind = file.kind === 'renamed' ? `renamed from ${file.oldPath}` : file.kind;
  const binary = file.binary ? ', binary' : '';
  return `${file.path} (${kind}${binary}, +${file.additions} -${file.deletions})`;
}

/** Formats one file's diff with line numbers. */
export function formatFileDiff(file: DiffFile): string {
  const out = [`### ${describeFile(file)}`];
  if (file.binary) {
    out.push('(binary file; contents not shown)');
    return out.join('\n');
  }
  if (file.hunks.length === 0) {
    out.push(file.kind === 'renamed' ? '(moved without content changes)' : '(no line changes)');
    return out.join('\n');
  }
  out.push(`${'OLD'.padStart(COLUMN)} ${'NEW'.padStart(COLUMN)}`);
  for (const hunk of file.hunks) {
    out.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${hunk.section ? ` ${hunk.section}` : ''}`,
    );
    for (const line of hunk.lines) {
      const marker = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
      out.push(`${column(line.oldLine)} ${column(line.newLine)} ${marker}  ${line.content}`);
    }
  }
  return out.join('\n');
}

/** Formats a full file with line numbers, for context. */
export function formatFileContent(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.map((line, index) => `${String(index + 1).padStart(COLUMN)}  ${line}`).join('\n');
}

/**
 * Estimates the number of tokens in a text.
 *
 * Providers count tokens differently, and the pipeline only needs an estimate to decide
 * whether a PR fits in one call. Code averages about 3.5 characters per token, so this errs on
 * the side of counting too many.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
