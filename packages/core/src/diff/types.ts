import type { ChangeKind } from '../schema/document';

export interface DiffLine {
  type: 'context' | 'add' | 'delete';
  /** Line text without the leading `+`, `-`, or space. */
  content: string;
  /** Line number in the old file, or null for added lines. */
  oldLine: number | null;
  /** Line number in the new file, or null for deleted lines. */
  newLine: number | null;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Text after the closing `@@`, usually the enclosing function or class. */
  section: string;
  lines: DiffLine[];
}

export interface DiffFile {
  /** The path a reviewer cares about: the new path, or the old path for deleted files. */
  path: string;
  /** Path before the change. Null for added files. */
  oldPath: string | null;
  /** Path after the change. Null for deleted files. */
  newPath: string | null;
  kind: ChangeKind;
  binary: boolean;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  /**
   * Set when a large file was split into parts for batched analysis: this object holds only
   * some of the file's hunks, and `additions` and `deletions` count only those hunks.
   */
  part?: { index: number; total: number };
}
