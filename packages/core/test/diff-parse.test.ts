import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff, unquotePath } from '../src/diff/parse';
import { fixtureDiff } from './helpers';

describe('parseUnifiedDiff', () => {
  it('parses a small single-hunk diff with exact line numbers', () => {
    const [file, ...rest] = parseUnifiedDiff(fixtureDiff('small.diff'));
    expect(rest).toEqual([]);
    expect(file).toMatchObject({
      path: 'src/lib/rate-limit.ts',
      oldPath: 'src/lib/rate-limit.ts',
      newPath: 'src/lib/rate-limit.ts',
      kind: 'modified',
      binary: false,
      additions: 5,
      deletions: 1,
    });
    const hunk = file!.hunks[0]!;
    expect(hunk).toMatchObject({
      oldStart: 8,
      newStart: 8,
      section: 'const hits = new Map<string, number[]>();',
    });
    const added = hunk.lines.filter((line) => line.type === 'add');
    expect(added[0]).toEqual({
      type: 'add',
      content: '  if (recent.length >= options.limit) {',
      oldLine: null,
      newLine: 11,
    });
    const removed = hunk.lines.find((line) => line.type === 'delete');
    expect(removed).toMatchObject({
      content: '  return recent.length <= options.limit;',
      oldLine: 13,
    });
  });

  it('parses several hunks across files', () => {
    const files = parseUnifiedDiff(fixtureDiff('medium.diff'));
    expect(files.map((file) => file.path)).toEqual(['src/api/server.ts', 'src/api/upload.ts']);
    expect(files[0]!.hunks).toHaveLength(2);
    // Line numbers continue correctly across hunks.
    for (const file of files) {
      for (const hunk of file.hunks) {
        const newLines = hunk.lines.filter((l) => l.newLine !== null).map((l) => l.newLine!);
        expect(newLines).toEqual(newLines.map((_, i) => hunk.newStart + i));
        expect(newLines).toHaveLength(hunk.newLines);
      }
    }
  });

  it('recognizes added, modified, deleted, and binary files', () => {
    const files = parseUnifiedDiff(fixtureDiff('multi-file.diff'));
    const byPath = Object.fromEntries(files.map((file) => [file.path, file]));
    expect(byPath['docs/README.md']?.kind).toBe('modified');
    expect(byPath['docs/logo.png']).toMatchObject({ kind: 'modified', binary: true, hunks: [] });
    expect(byPath['src/lib/metrics.ts']).toMatchObject({
      kind: 'added',
      oldPath: null,
      additions: 9,
    });
    expect(byPath['src/lib/legacy-format.ts']).toMatchObject({
      kind: 'deleted',
      newPath: null,
      oldPath: 'src/lib/legacy-format.ts',
      deletions: 6,
    });
  });

  it('parses pure renames and renames with edits', () => {
    const files = parseUnifiedDiff(fixtureDiff('rename.diff'));
    expect(files[0]).toMatchObject({
      path: 'docs/index.md',
      oldPath: 'docs/README.md',
      newPath: 'docs/index.md',
      kind: 'renamed',
      hunks: [],
    });
    expect(files[1]).toMatchObject({
      path: 'src/config/load.ts',
      oldPath: 'src/lib/config.ts',
      kind: 'renamed',
      additions: 1,
      deletions: 1,
    });
  });

  it('parses a deletion-only diff', () => {
    const files = parseUnifiedDiff(fixtureDiff('deletion-only.diff'));
    expect(files.map((file) => [file.path, file.kind])).toEqual([
      ['src/lib/legacy-format.ts', 'deleted'],
      ['src/lib/old-helpers.ts', 'deleted'],
    ]);
    expect(files.every((file) => file.additions === 0)).toBe(true);
  });

  it('handles "no newline at end of file" markers', () => {
    const diff = [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,2 +1,2 @@',
      ' one',
      '-two',
      '\\ No newline at end of file',
      '+two!',
      '\\ No newline at end of file',
    ].join('\n');
    const [file] = parseUnifiedDiff(diff);
    expect(file!.hunks[0]!.lines.map((l) => l.type)).toEqual(['context', 'delete', 'add']);
  });

  it('stops each hunk at its line count, ignoring format-patch trailers', () => {
    const diff = [
      'From 1234 Mon Sep 17 00:00:00 2001',
      'Subject: [PATCH] Change',
      '---',
      ' a.txt | 2 +-',
      '',
      'diff --git a/a.txt b/a.txt',
      'index 1..2 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '-- ',
      '2.45.0',
      '',
    ].join('\n');
    const [file] = parseUnifiedDiff(diff);
    expect(file!.hunks[0]!.lines).toHaveLength(2);
    expect(file!.deletions).toBe(1);
  });

  it('handles CRLF line endings', () => {
    const diff =
      'diff --git a/a.txt b/a.txt\r\n--- a/a.txt\r\n+++ b/a.txt\r\n@@ -1 +1 @@\r\n-a\r\n+b\r\n';
    const [file] = parseUnifiedDiff(diff);
    expect(file!.hunks[0]!.lines.map((l) => l.content)).toEqual(['a', 'b']);
  });

  it('decodes quoted paths with special characters', () => {
    const diff = [
      'diff --git "a/docs/caf\\303\\251 menu.md" "b/docs/caf\\303\\251 menu.md"',
      '--- "a/docs/caf\\303\\251 menu.md"',
      '+++ "b/docs/caf\\303\\251 menu.md"',
      '@@ -1 +1 @@',
      '-a',
      '+b',
    ].join('\n');
    expect(parseUnifiedDiff(diff)[0]!.path).toBe('docs/café menu.md');
  });

  it('handles paths with spaces in an unquoted git header', () => {
    const diff =
      'diff --git a/my file.txt b/my file.txt\nindex 1..2 100644\nBinary files a/my file.txt and b/my file.txt differ\n';
    expect(parseUnifiedDiff(diff)[0]).toMatchObject({ path: 'my file.txt', binary: true });
  });

  it('parses plain `diff -u` output without git headers', () => {
    const diff = [
      '--- old/config.ini\t2024-01-01 10:00:00.000000000 +0000',
      '+++ new/config.ini\t2024-01-02 10:00:00.000000000 +0000',
      '@@ -1,2 +1,2 @@',
      ' [server]',
      '-port=80',
      '+port=8080',
    ].join('\n');
    const [file] = parseUnifiedDiff(diff);
    expect(file).toMatchObject({
      path: 'new/config.ini',
      kind: 'modified',
      additions: 1,
      deletions: 1,
    });
  });

  it('treats mode-only changes as modified files without hunks', () => {
    const diff = 'diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n';
    expect(parseUnifiedDiff(diff)).toEqual([
      expect.objectContaining({ path: 'run.sh', kind: 'modified', hunks: [] }),
    ]);
  });

  it('returns no files for empty input', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('just some text\n')).toEqual([]);
  });

  it('keeps a truncated hunk instead of failing', () => {
    const diff = 'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,5 +1,5 @@\n context\n-gone\n';
    const [file] = parseUnifiedDiff(diff);
    expect(file!.hunks[0]!.lines).toHaveLength(2);
  });
});

describe('unquotePath', () => {
  it('leaves unquoted paths alone', () => {
    expect(unquotePath('src/a.ts')).toBe('src/a.ts');
  });

  it('decodes escapes', () => {
    expect(unquotePath('"a\\tb\\"c"')).toBe('a\tb"c');
  });
});
