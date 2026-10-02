import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run, type CliIO } from '../src';
import { fixtureDiff, mockModel } from '../../core/test/helpers';

const explanation = {
  title: 'Stop recording hits after the limit',
  summary: '`isAllowed` now returns early once a key reaches the limit.',
  changes: [
    {
      file: 'src/lib/rate-limit.ts',
      what: '`isAllowed` returns early.',
      why: 'Memory stays bounded.',
    },
  ],
  flow: {
    caption: 'The server calls `isAllowed`.',
    nodes: [
      { id: 'server', label: 'server', kind: 'entry', file: null, changed: false },
      {
        id: 'limit',
        label: 'isAllowed',
        kind: 'function',
        file: 'src/lib/rate-limit.ts',
        changed: true,
      },
    ],
    edges: [{ from: 'server', to: 'limit', label: 'client key' }],
  },
  risks: [],
  tests: [
    {
      description: 'Send 101 requests from one IP and confirm the last one gets 429.',
      related_files: [],
    },
  ],
};

interface Harness {
  io: CliIO;
  stdout: () => string;
  stderr: () => string;
  opened: string[];
}

function harness(
  cwd: string,
  options: { stdin?: string; tty?: boolean; env?: NodeJS.ProcessEnv } = {},
): Harness {
  let out = '';
  let err = '';
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.on('data', (chunk) => (out += chunk));
  stderr.on('data', (chunk) => (err += chunk));
  const stdin = Object.assign(new PassThrough(), { isTTY: options.tty ?? false });
  if (options.stdin !== undefined) stdin.end(options.stdin);
  else if (!options.tty) stdin.end();
  const opened: string[] = [];
  return {
    io: {
      stdout,
      stderr,
      stdin,
      env: { LUCIDIFF_PLAIN_OUTPUT: '1', ...options.env },
      cwd,
      openFile: async (file) => {
        opened.push(file);
      },
      languageModel: mockModel([explanation]),
    },
    stdout: () => out,
    stderr: () => err,
    opened,
  };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'lucidiff-cli-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('lucidiff CLI', () => {
  it('explains a diff file and writes an HTML page', async () => {
    await writeFile(path.join(dir, 'change.diff'), fixtureDiff('small.diff'));
    const h = harness(dir);
    const code = await run(['change.diff', '-o', 'out/review.html', '--open'], h.io);
    expect(code).toBe(0);
    const page = await readFile(path.join(dir, 'out/review.html'), 'utf8');
    expect(page).toContain('Stop recording hits after the limit');
    expect(h.opened).toEqual([path.join(dir, 'out/review.html')]);
    expect(h.stderr()).toMatch(
      /Tokens: [\d,]+ input · [\d,]+ output · 1 model call \(mock-model\)/,
    );
    expect(h.stderr()).toContain('✔ Analyzing with mock-model');
  });

  it('names the output after the source when -o is not set', async () => {
    await writeFile(path.join(dir, 'change.diff'), fixtureDiff('small.diff'));
    const h = harness(dir);
    expect(await run(['change.diff'], h.io)).toBe(0);
    await expect(readFile(path.join(dir, 'change-diff.explainer.html'), 'utf8')).resolves.toContain(
      '<!doctype html>',
    );
  });

  it('prints JSON to stdout with --json', async () => {
    await writeFile(path.join(dir, 'change.diff'), fixtureDiff('small.diff'));
    const h = harness(dir);
    expect(await run(['change.diff', '--json'], h.io)).toBe(0);
    const document = JSON.parse(h.stdout());
    expect(document.schema_version).toBe(1);
    expect(document.changes[0].file).toBe('src/lib/rate-limit.ts');
    // Progress goes to stderr only, so stdout stays valid JSON.
    expect(h.stdout().trim().startsWith('{')).toBe(true);
  });

  it('reads a diff from stdin with --stdin', async () => {
    const h = harness(dir, { stdin: fixtureDiff('small.diff') });
    expect(await run(['--stdin', '--json'], h.io)).toBe(0);
    expect(JSON.parse(h.stdout()).meta.source).toMatchObject({ kind: 'diff', label: 'stdin' });
  });

  it('reads piped stdin when no input is given', async () => {
    const h = harness(dir, { stdin: fixtureDiff('small.diff') });
    expect(await run([], h.io)).toBe(0);
    await expect(readFile(path.join(dir, 'explainer.html'), 'utf8')).resolves.toContain(
      '<!doctype html>',
    );
  });

  it('renders a saved JSON document', async () => {
    await writeFile(
      path.join(dir, 'doc.json'),
      await readFile(new URL('../../../fixtures/sample-document.json', import.meta.url)),
    );
    const h = harness(dir);
    expect(await run(['render', 'doc.json'], h.io)).toBe(0);
    await expect(readFile(path.join(dir, 'doc.html'), 'utf8')).resolves.toContain(
      'Retry failed webhook deliveries',
    );
  });

  it('explains a local git range', async () => {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: dir, stdio: 'pipe' }).toString();
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    await writeFile(path.join(dir, 'a.ts'), 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'feature');
    await writeFile(path.join(dir, 'a.ts'), 'export const a = 2;\nexport const b = 3;\n');
    git('commit', '-qam', 'change');

    const h = harness(dir);
    expect(await run(['--git', 'main...feature', '--json'], h.io)).toBe(0);
    const document = JSON.parse(h.stdout());
    expect(document.meta.source).toMatchObject({
      kind: 'git',
      label: 'main...feature',
      base_ref: 'main',
      head_ref: 'feature',
    });
    expect(document.changes[0]).toMatchObject({ file: 'a.ts', additions: 2, deletions: 1 });
  });

  it('explains uncommitted changes with a bare --git', async () => {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: dir, stdio: 'pipe' }).toString();
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    await writeFile(path.join(dir, 'a.ts'), 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    await writeFile(path.join(dir, 'a.ts'), 'export const a = 2;\n');

    const h = harness(dir);
    expect(await run(['--git', '--json'], h.io)).toBe(0);
    expect(JSON.parse(h.stdout()).meta.source).toMatchObject({
      label: 'uncommitted changes',
      head_ref: 'working tree',
    });
  });

  it('rejects git ranges that look like options', async () => {
    const h = harness(dir);
    expect(await run(['--git', '--output=/etc/passwd'], h.io)).not.toBe(0);
  });

  it('explains what to do when there is no input', async () => {
    const h = harness(dir, { tty: true });
    expect(await run([], h.io)).toBe(1);
    expect(h.stderr()).toContain('Nothing to explain');
  });

  it('reports a missing file without a stack trace', async () => {
    const h = harness(dir);
    expect(await run(['missing.diff'], h.io)).toBe(1);
    expect(h.stderr()).toContain('Error: File not found: missing.diff');
    expect(h.stderr()).not.toContain('    at ');
  });

  it('rejects URLs that are not pull requests', async () => {
    const h = harness(dir);
    expect(await run(['https://github.com/owner/repo/issues/1'], h.io)).toBe(1);
    expect(h.stderr()).toContain('is not a pull request URL');
  });

  it('prints the version', async () => {
    const h = harness(dir);
    expect(await run(['--version'], h.io)).toBe(0);
    expect(h.stdout().trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('prints help with examples', async () => {
    const h = harness(dir);
    expect(await run(['--help'], h.io)).toBe(0);
    expect(h.stdout()).toContain('lucidiff --git main...feature-branch');
  });
});
