import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadGitRange, parseGitRange, repositoryFromRemote, UserError } from '../src';

describe('parseGitRange', () => {
  it.each([
    [undefined, { base: 'HEAD', head: null, mergeBase: false }],
    ['', { base: 'HEAD', head: null, mergeBase: false }],
    ['main', { base: 'main', head: null, mergeBase: false }],
    ['main..feature', { base: 'main', head: 'feature', mergeBase: false }],
    ['main...feature', { base: 'main', head: 'feature', mergeBase: true }],
    ['HEAD~3..HEAD', { base: 'HEAD~3', head: 'HEAD', mergeBase: false }],
    ['origin/main...', { base: 'origin/main', head: 'HEAD', mergeBase: true }],
    ['v1.2.0..v1.3.0', { base: 'v1.2.0', head: 'v1.3.0', mergeBase: false }],
  ])('parses %s', (range, expected) => {
    expect(parseGitRange(range)).toEqual(expected);
  });

  it.each(['--output=/tmp/x', 'main..--exec=sh', 'main;rm -rf /', 'a b', 'a..b..c', '$(whoami)'])(
    'rejects %s',
    (range) => {
      expect(() => parseGitRange(range)).toThrow(UserError);
    },
  );
});

describe('repositoryFromRemote', () => {
  it.each([
    ['https://github.com/acme/api.git', 'acme/api'],
    ['git@github.com:acme/api.git', 'acme/api'],
    ['https://github.com/acme/api', 'acme/api'],
    ['https://gitlab.com/acme/api.git', null],
  ])('reads %s', (remote, expected) => {
    expect(repositoryFromRemote(remote)).toBe(expected);
  });
});

describe('loadGitRange', () => {
  let dir: string;
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, stdio: 'pipe' }).toString().trim();

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'lucidiff-git-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'diff.noprefix', 'true'); // A user setting that must not break parsing.
    await mkdir(path.join(dir, 'src'));
    await writeFile(
      path.join(dir, 'src/config.ts'),
      'export const port = 3000;\nexport const host = "localhost";\nexport const debug = false;\n',
    );
    await writeFile(path.join(dir, 'src/unused.ts'), 'export {};\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('remote', 'add', 'origin', 'git@github.com:acme/api.git');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('loads a merge-base range with renames and full contents', async () => {
    git('checkout', '-qb', 'feature');
    await mkdir(path.join(dir, 'lib'));
    git('mv', 'src/config.ts', 'lib/config.ts');
    await writeFile(
      path.join(dir, 'lib/config.ts'),
      'export const port = 8080;\nexport const host = "localhost";\nexport const debug = false;\n',
    );
    git('rm', '-q', 'src/unused.ts');
    git('commit', '-qam', 'move config');
    // A commit on main after the branch point must not appear in a three-dot range.
    git('checkout', '-q', 'main');
    await writeFile(path.join(dir, 'main-only.txt'), 'main\n');
    git('add', '.');
    git('commit', '-qm', 'main moves on');

    const { changeSet, fetchContents } = await loadGitRange('main...feature', { cwd: dir });
    expect(changeSet.source).toMatchObject({
      kind: 'git',
      repository: 'acme/api',
      base_ref: 'main',
      head_ref: 'feature',
    });
    expect(changeSet.files.map((file) => [file.path, file.kind, file.oldPath])).toEqual([
      ['lib/config.ts', 'renamed', 'src/config.ts'],
      ['src/unused.ts', 'deleted', 'src/unused.ts'],
    ]);
    const contents = await fetchContents!(changeSet.files);
    expect(contents.get('lib/config.ts')?.base).toContain('port = 3000');
    expect(contents.get('lib/config.ts')?.head).toContain('port = 8080');
    expect(contents.get('src/unused.ts')).toEqual({ base: 'export {};\n', head: null });
  });

  it('loads uncommitted changes from the working tree', async () => {
    await writeFile(path.join(dir, 'src/unused.ts'), 'export const used = true;\n');
    const { changeSet, fetchContents } = await loadGitRange('', { cwd: dir });
    expect(changeSet.source).toMatchObject({
      label: 'uncommitted changes',
      base_ref: 'HEAD',
      head_ref: 'working tree',
    });
    const contents = await fetchContents!(changeSet.files);
    expect(contents.get('src/unused.ts')).toEqual({
      base: 'export {};\n',
      head: 'export const used = true;\n',
    });
  });

  it('fails clearly when there are no changes', async () => {
    await expect(loadGitRange('', { cwd: dir })).rejects.toThrow(/No changes found/);
  });

  it('fails clearly outside a repository', async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'lucidiff-nogit-'));
    await expect(loadGitRange('', { cwd: outside })).rejects.toThrow(/not inside a git repository/);
    await rm(outside, { recursive: true, force: true });
  });

  it('fails clearly for an unknown ref', async () => {
    await expect(loadGitRange('main...does-not-exist', { cwd: dir })).rejects.toThrow(UserError);
  });
});
