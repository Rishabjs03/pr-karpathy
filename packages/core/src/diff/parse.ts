/**
 * A parser for unified diffs, as produced by `git diff`, `git format-patch`, `diff -u`, and
 * the GitHub API.
 *
 * Line numbers are the reason this parser exists. Every risk the model reports must cite lines
 * that the PR changed, so we need the exact old and new line number of every diff line. Hunks
 * are read by their line counts (not by guessing where they end), which keeps trailing text
 * such as a `format-patch` signature out of the last hunk.
 */
import type { DiffFile, DiffHunk, DiffLine } from './types';

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

interface FileBuilder {
  headerOld: string | null;
  headerNew: string | null;
  oldPath: string | null | undefined;
  newPath: string | null | undefined;
  added: boolean;
  deleted: boolean;
  renamed: boolean;
  binary: boolean;
  /** True when the `diff --git` header used `a/` and `b/` prefixes. */
  prefixed: boolean;
  sawFileLines: boolean;
  hunks: DiffHunk[];
}

function newBuilder(): FileBuilder {
  return {
    headerOld: null,
    headerNew: null,
    oldPath: undefined,
    newPath: undefined,
    added: false,
    deleted: false,
    renamed: false,
    binary: false,
    prefixed: true,
    sawFileLines: false,
    hunks: [],
  };
}

/** Decodes a C-style quoted path, as git writes for names with special characters. */
export function unquotePath(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"') || value.length < 2) return value;
  const bytes: number[] = [];
  const body = value.slice(1, -1);
  const simple: Record<string, number> = {
    n: 10,
    t: 9,
    r: 13,
    '"': 34,
    '\\': 92,
    a: 7,
    b: 8,
    f: 12,
    v: 11,
  };
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (char !== '\\') {
      bytes.push(...Buffer.from(char, 'utf8'));
      continue;
    }
    const next = body[index + 1] ?? '';
    if (/[0-7]/.test(next)) {
      const octal = /^[0-7]{1,3}/.exec(body.slice(index + 1))![0];
      bytes.push(Number.parseInt(octal, 8));
      index += octal.length;
    } else {
      bytes.push(simple[next] ?? next.charCodeAt(0));
      index += 1;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

/** Reads the path from a `---` or `+++` line. Returns null for `/dev/null`. */
function pathFromFileLine(rest: string, prefix: 'a/' | 'b/', stripPrefix: boolean): string | null {
  // `diff -u` appends a tab and a timestamp; git quotes paths with special characters.
  const raw = rest.startsWith('"') ? unquotePath(rest.trim()) : rest.split('\t')[0]!.trimEnd();
  if (raw === '/dev/null') return null;
  return stripPrefix && raw.startsWith(prefix) ? raw.slice(2) : raw;
}

/** Splits the paths out of a `diff --git a/x b/y` line. */
function pathsFromGitHeader(rest: string): { old: string; new: string; prefixed: boolean } | null {
  const quoted = /^("(?:[^"\\]|\\.)*"|\S+) ("(?:[^"\\]|\\.)*")$|^("(?:[^"\\]|\\.)*") (\S+)$/.exec(
    rest,
  );
  if (quoted && rest.includes('"')) {
    const [first, second] = quoted[1] ? [quoted[1], quoted[2]!] : [quoted[3]!, quoted[4]!];
    const oldPath = unquotePath(first);
    const newPath = unquotePath(second);
    const prefixed = oldPath.startsWith('a/') && newPath.startsWith('b/');
    return {
      old: prefixed ? oldPath.slice(2) : oldPath,
      new: prefixed ? newPath.slice(2) : newPath,
      prefixed,
    };
  }
  // Unquoted: when both sides name the same file, the line is "a/P b/P" with equal halves.
  const half = (rest.length - 1) / 2;
  if (Number.isInteger(half) && rest[half] === ' ') {
    const left = rest.slice(0, half);
    const right = rest.slice(half + 1);
    if (left.startsWith('a/') && right.startsWith('b/') && left.slice(2) === right.slice(2)) {
      return { old: left.slice(2), new: right.slice(2), prefixed: true };
    }
    if (left === right) return { old: left, new: right, prefixed: false };
  }
  const split = rest.lastIndexOf(' b/');
  if (rest.startsWith('a/') && split > 0) {
    return { old: rest.slice(2, split), new: rest.slice(split + 3), prefixed: true };
  }
  return null;
}

function finish(builder: FileBuilder, files: DiffFile[]): void {
  let oldPath = builder.oldPath === undefined ? builder.headerOld : builder.oldPath;
  let newPath = builder.newPath === undefined ? builder.headerNew : builder.newPath;
  if (builder.added) oldPath = null;
  if (builder.deleted) newPath = null;
  if (oldPath === null && newPath === null) return;
  if (oldPath === undefined && newPath === undefined) return;

  const kind =
    oldPath === null
      ? 'added'
      : newPath === null
        ? 'deleted'
        : builder.renamed && oldPath !== newPath
          ? 'renamed'
          : 'modified';
  const path = (newPath ?? oldPath)!;

  let additions = 0;
  let deletions = 0;
  for (const hunk of builder.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'add') additions += 1;
      else if (line.type === 'delete') deletions += 1;
    }
  }

  files.push({
    path,
    oldPath: oldPath ?? null,
    // For plain `diff -u` output the two paths often differ (old/x vs new/x) without a rename.
    newPath: kind === 'modified' ? path : (newPath ?? null),
    kind,
    binary: builder.binary,
    hunks: builder.hunks,
    additions,
    deletions,
  });
}

function readHunk(
  lines: string[],
  start: number,
  header: RegExpExecArray,
): { hunk: DiffHunk; next: number } {
  const oldStart = Number(header[1]);
  const oldLines = header[2] === undefined ? 1 : Number(header[2]);
  const newStart = Number(header[3]);
  const newLines = header[4] === undefined ? 1 : Number(header[4]);
  const hunk: DiffHunk = {
    oldStart,
    oldLines,
    newStart,
    newLines,
    section: header[5]?.trim() ?? '',
    lines: [],
  };

  let oldRemaining = oldLines;
  let newRemaining = newLines;
  let oldNo = oldStart;
  let newNo = newStart;
  let index = start;

  while ((oldRemaining > 0 || newRemaining > 0) && index < lines.length) {
    const line = lines[index]!;
    const marker = line[0];
    let parsed: DiffLine;
    if (marker === '+' && newRemaining > 0) {
      parsed = { type: 'add', content: line.slice(1), oldLine: null, newLine: newNo++ };
      newRemaining -= 1;
    } else if (marker === '-' && oldRemaining > 0) {
      parsed = { type: 'delete', content: line.slice(1), oldLine: oldNo++, newLine: null };
      oldRemaining -= 1;
    } else if (
      (marker === ' ' || (line === '' && index < lines.length - 1)) &&
      oldRemaining > 0 &&
      newRemaining > 0
    ) {
      // Some tools strip the space from empty context lines. The final empty string is only
      // the split after the last newline, not a line of the diff.
      parsed = { type: 'context', content: line.slice(1), oldLine: oldNo++, newLine: newNo++ };
      oldRemaining -= 1;
      newRemaining -= 1;
    } else if (marker === '\\') {
      index += 1;
      continue;
    } else {
      break; // Malformed or truncated hunk: keep what we have.
    }
    hunk.lines.push(parsed);
    index += 1;
  }
  // A "\ No newline at end of file" marker can follow the last line.
  while (lines[index]?.startsWith('\\')) index += 1;
  return { hunk, next: index };
}

/**
 * Parses a unified diff into files, hunks, and numbered lines.
 *
 * Text outside file sections (commit messages, email headers) is ignored. Combined diffs from
 * merge commits (`@@@`) are not supported and are skipped.
 */
export function parseUnifiedDiff(text: string): DiffFile[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const files: DiffFile[] = [];
  let current: FileBuilder | null = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    if (line.startsWith('diff --git ')) {
      if (current) finish(current, files);
      current = newBuilder();
      const paths = pathsFromGitHeader(line.slice('diff --git '.length));
      if (paths) {
        current.headerOld = paths.old;
        current.headerNew = paths.new;
        current.prefixed = paths.prefixed;
      }
      index += 1;
      continue;
    }

    if (line.startsWith('--- ') && lines[index + 1]?.startsWith('+++ ')) {
      if (!current || current.sawFileLines || current.hunks.length > 0) {
        if (current) finish(current, files);
        current = newBuilder();
        current.prefixed = false;
      }
      const oldRest = line.slice(4);
      const newRest = lines[index + 1]!.slice(4);
      const isGit = current.headerOld !== null || current.headerNew !== null;
      // Git tells us whether it used a/ and b/ prefixes. Without a git header, strip them only
      // when both sides use them, which is the common `diff -u a/x b/x` convention.
      const strip = isGit
        ? current.prefixed
        : oldRest.replace(/^"/, '').startsWith('a/') && newRest.replace(/^"/, '').startsWith('b/');
      current.oldPath = pathFromFileLine(oldRest, 'a/', strip);
      current.newPath = pathFromFileLine(newRest, 'b/', strip);
      current.sawFileLines = true;
      index += 2;
      continue;
    }

    const header = line.startsWith('@@ ') ? HUNK_HEADER.exec(line) : null;
    if (header && current) {
      const { hunk, next } = readHunk(lines, index + 1, header);
      current.hunks.push(hunk);
      index = next;
      continue;
    }

    if (current) {
      if (line.startsWith('new file mode')) current.added = true;
      else if (line.startsWith('deleted file mode')) current.deleted = true;
      else if (line.startsWith('rename from ')) {
        current.renamed = true;
        current.oldPath = unquotePath(line.slice('rename from '.length));
      } else if (line.startsWith('rename to ')) {
        current.renamed = true;
        current.newPath = unquotePath(line.slice('rename to '.length));
      } else if (line.startsWith('copy to ')) {
        // A copy creates a new file; the source is unchanged.
        current.added = true;
        current.newPath = unquotePath(line.slice('copy to '.length));
      } else if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
        current.binary = true;
        if (line.includes('/dev/null and')) current.added = true;
        if (line.endsWith('and /dev/null differ')) current.deleted = true;
      }
    }
    index += 1;
  }

  if (current) finish(current, files);
  return files;
}
