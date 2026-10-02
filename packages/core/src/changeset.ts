/**
 * The common shape every input source produces: a GitHub PR, a local git range, or a raw diff.
 * The rest of the pipeline only works with this shape.
 */
import type { DiffFile } from './diff/types';
import type { SkippedFile, Source } from './schema/document';

export interface PullRequestInfo {
  url: string | null;
  number: number | null;
  title: string | null;
  description: string | null;
}

/** Full file contents around a change, for context. Null means the side does not exist. */
export interface FileContents {
  /** The file before the change. */
  base: string | null;
  /** The file after the change. */
  head: string | null;
}

export interface ChangeSet {
  source: Source;
  pr: PullRequestInfo | null;
  files: DiffFile[];
  /** Full file contents keyed by `DiffFile.path`. Empty for raw diffs. */
  contents: Map<string, FileContents>;
  /** Files the source already knows it cannot show (for example, a diff GitHub truncated). */
  skipped: SkippedFile[];
}

/** A change set after filtering and redaction: what the model will see. */
export interface PreparedChangeSet extends ChangeSet {
  /** Files that are not sent to the model, with the reason. */
  skipped: SkippedFile[];
  /** Number of secrets replaced in the diff, contents, and PR text. */
  redactions: number;
  /** Count of redactions by kind, for --verbose output. */
  redactionsByKind: Record<string, number>;
}
