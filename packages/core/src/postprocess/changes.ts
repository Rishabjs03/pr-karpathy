/**
 * Merges the model's per-file explanations with facts from the diff.
 *
 * The model writes `what` and `why`. The diff supplies the change kind, line counts, and
 * rename source, so those can never be wrong. Every analyzed file appears exactly once: files
 * the model skipped get `what: null`, and entries for files that are not in the diff are
 * dropped. When a large file was split into parts (batched mode), the parts' texts are joined.
 */
import type { DiffFile } from '../diff/types';
import type { DocumentChange } from '../schema/document';
import type { LlmChange } from '../schema/llm';
import type { FileIndex } from './paths';
import { clampText } from './text';

export interface ChangesResult {
  changes: DocumentChange[];
  /** Paths the model described that are not in the diff. */
  unknownFiles: string[];
}

function joinDistinct(first: string, second: string): string {
  const a = first.trim();
  const b = second.trim();
  if (!a || a === b) return b || a;
  if (!b) return a;
  return `${a} ${b}`;
}

function toDocumentChange(file: DiffFile, change: LlmChange | null): DocumentChange {
  return {
    file: file.path,
    old_file: file.kind === 'renamed' ? file.oldPath : null,
    kind: file.kind,
    additions: file.additions,
    deletions: file.deletions,
    what: change?.what.trim() ? clampText(change.what, 1500) : null,
    why: change?.why.trim() ? clampText(change.why, 1500) : null,
  };
}

/**
 * @param llmChanges - Entries the model wrote, in its order (most important first).
 * @param index - The analyzed files.
 */
export function mergeChanges(llmChanges: readonly LlmChange[], index: FileIndex): ChangesResult {
  const described = new Map<DiffFile, LlmChange>();
  const order: DiffFile[] = [];
  const unknownFiles: string[] = [];

  for (const change of llmChanges) {
    const file = index.find(change.file);
    if (!file) {
      unknownFiles.push(change.file);
      continue;
    }
    const previous = described.get(file);
    if (previous) {
      described.set(file, {
        file: previous.file,
        what: joinDistinct(previous.what, change.what),
        why: joinDistinct(previous.why, change.why),
      });
      continue;
    }
    described.set(file, change);
    order.push(file);
  }
  for (const file of index.files) if (!described.has(file)) order.push(file);

  return {
    changes: order.map((file) => toDocumentChange(file, described.get(file) ?? null)),
    unknownFiles,
  };
}
