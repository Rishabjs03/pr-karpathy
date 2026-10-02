import type { ChangeSet, FileContents } from '../changeset';
import type { DiffFile } from '../diff/types';

/** A loaded source: the diff, plus a way to fetch full contents for the files that matter. */
export interface LoadedSource {
  changeSet: ChangeSet;
  /** Fetches base and head contents for the given files. Absent for raw diffs. */
  fetchContents?: (files: readonly DiffFile[]) => Promise<Map<string, FileContents>>;
}
