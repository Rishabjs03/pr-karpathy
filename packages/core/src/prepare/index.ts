/**
 * Prepares a change set for the model: filter the files, then redact secrets everywhere.
 *
 * The pipeline fetches full file contents between these two steps, so that skipped files
 * (lockfiles, binaries) never cost a request and their contents are never read.
 */
import type { ChangeSet, FileContents, PreparedChangeSet } from '../changeset';
import type { DiffFile } from '../diff/types';
import {
  createRedactionCounter,
  isEnvFile,
  LineRedactor,
  redactText,
  type RedactionCounter,
} from './redact';

function redactFile(file: DiffFile, counter: RedactionCounter): DiffFile {
  const envFile = isEnvFile(file.path) || (file.oldPath ? isEnvFile(file.oldPath) : false);
  return {
    ...file,
    hunks: file.hunks.map((hunk) => {
      const redactor = new LineRedactor(counter, envFile);
      return {
        ...hunk,
        section: redactor.redact(hunk.section),
        lines: hunk.lines.map((line) => ({ ...line, content: redactor.redact(line.content) })),
      };
    }),
  };
}

/**
 * Redacts likely secrets in the diff, the file contents, and the PR title and description.
 *
 * @param changeSet - A change set that is already filtered to the files the model will see.
 * @param enabled - Set to false to skip redaction (not recommended).
 */
export function redactChangeSet(changeSet: ChangeSet, enabled = true): PreparedChangeSet {
  if (!enabled) return { ...changeSet, redactions: 0, redactionsByKind: {} };

  const counter = createRedactionCounter();
  const files = changeSet.files.map((file) => redactFile(file, counter));
  const contents = new Map<string, FileContents>();
  for (const [path, entry] of changeSet.contents) {
    contents.set(path, {
      base: entry.base === null ? null : redactText(entry.base, counter, { path }),
      head: entry.head === null ? null : redactText(entry.head, counter, { path }),
    });
  }
  const pr = changeSet.pr && {
    ...changeSet.pr,
    title: changeSet.pr.title === null ? null : redactText(changeSet.pr.title, counter),
    description:
      changeSet.pr.description === null ? null : redactText(changeSet.pr.description, counter),
  };
  return {
    ...changeSet,
    pr,
    files,
    contents,
    redactions: counter.total,
    redactionsByKind: counter.byKind,
  };
}

export {
  DEFAULT_IGNORE_PATTERNS,
  filterFiles,
  type FilterOptions,
  type FilterResult,
} from './filter';
export {
  createRedactionCounter,
  isEnvFile,
  LineRedactor,
  redactLine,
  redactText,
  type RedactionCounter,
} from './redact';
