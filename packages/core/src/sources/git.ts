/**
 * Loads changes from a local git repository.
 *
 * Supported ranges follow `git diff`:
 *   (none)          uncommitted changes: HEAD against the working tree
 *   <ref>           <ref> against the working tree
 *   <a>..<b>        <a> against <b>
 *   <a>...<b>       the merge base of <a> and <b> against <b>, which is what a PR shows
 *
 * git runs through `execFile` (no shell), and refs are checked before use, so a range can
 * never become a command-line option or a shell command.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ChangeSet, FileContents } from '../changeset';
import { parseUnifiedDiff } from '../diff/parse';
import type { DiffFile } from '../diff/types';
import { UserError } from '../errors';
import { mapWithConcurrency } from '../util/concurrency';
import type { LoadedSource } from './types';

const run = promisify(execFile);
const MAX_BUFFER = 256 * 1024 * 1024;

export interface GitOptions {
  /** Directory inside the repository. Defaults to the current directory. */
  cwd?: string;
  /** Skip the contents of files larger than this many bytes. Default 400 KB. */
  maxContentBytes?: number;
}

export interface GitRange {
  /** The ref the change starts from, or "HEAD" for uncommitted changes. */
  base: string;
  /** The ref the change ends at, or null for the working tree. */
  head: string | null;
  /** True for `a...b`: compare from the merge base. */
  mergeBase: boolean;
}

/** A conservative check for a git ref or revision expression. Rejects anything like an option. */
const SAFE_REF = /^(?!-)[A-Za-z0-9._/@{}^~:+-]+$/;

/**
 * Parses a range such as `main...feature`, `HEAD~3..HEAD`, `v1.2.0`, or an empty string.
 *
 * @throws {UserError} when a ref contains characters git refs cannot contain.
 */
export function parseGitRange(range: string | undefined): GitRange {
  const text = range?.trim() ?? '';
  if (!text) return { base: 'HEAD', head: null, mergeBase: false };
  const three = text.split('...');
  const two = text.split('..');
  let parsed: GitRange;
  if (three.length === 2)
    parsed = { base: three[0] || 'HEAD', head: three[1] || 'HEAD', mergeBase: true };
  else if (two.length === 2)
    parsed = { base: two[0] || 'HEAD', head: two[1] || 'HEAD', mergeBase: false };
  else if (two.length === 1) parsed = { base: text, head: null, mergeBase: false };
  else throw new UserError(`"${text}" is not a git range. Use <ref>, <a>..<b>, or <a>...<b>.`);

  for (const ref of [parsed.base, parsed.head]) {
    if (ref !== null && !SAFE_REF.test(ref)) {
      throw new UserError(`"${ref}" is not a valid git ref.`);
    }
  }
  return parsed;
}

async function git(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await run('git', args, {
      cwd,
      maxBuffer: MAX_BUFFER,
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' },
    });
    return stdout;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new UserError('git is not installed or not on PATH.', { cause: error });
    }
    throw new UserError(`git ${args[0]} failed: ${stderr || (error as Error).message}`, {
      cause: error,
    });
  }
}

/** Turns a GitHub remote URL into "owner/repo", or returns null. */
export function repositoryFromRemote(remote: string): string | null {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(remote.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

/** Loads a local git range as a change set. */
export async function loadGitRange(
  range: string | undefined,
  options: GitOptions = {},
): Promise<LoadedSource> {
  const cwd = options.cwd ?? process.cwd();
  const parsed = parseGitRange(range);
  const root = (
    await git(['rev-parse', '--show-toplevel'], cwd).catch(() => {
      throw new UserError(`${cwd} is not inside a git repository.`);
    })
  ).trim();

  const base = parsed.mergeBase
    ? (await git(['merge-base', parsed.base, parsed.head ?? 'HEAD'], root)).trim()
    : parsed.base;
  const diffArgs = [
    '-c',
    'core.quotePath=true',
    'diff',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--no-relative',
    '--find-renames',
    '--src-prefix=a/',
    '--dst-prefix=b/',
    base,
    ...(parsed.head ? [parsed.head] : []),
    '--',
  ];
  const diff = await git(diffArgs, root);
  const files = parseUnifiedDiff(diff);
  const label = range?.trim() || 'uncommitted changes';
  if (files.length === 0) throw new UserError(`No changes found for ${label}.`);

  const remote = await git(['remote', 'get-url', 'origin'], root).catch(() => '');
  const changeSet: ChangeSet = {
    source: {
      kind: 'git',
      label,
      repository: repositoryFromRemote(remote) ?? path.basename(root),
      base_ref: parsed.base,
      head_ref: parsed.head ?? 'working tree',
      author: null,
    },
    pr: null,
    files,
    contents: new Map(),
    skipped: [],
  };

  const maxBytes = options.maxContentBytes ?? 400_000;
  const readAt = async (ref: string | null, file: string): Promise<string | null> => {
    try {
      const text =
        ref === null
          ? await readFile(path.join(root, file), 'utf8')
          : await git(['cat-file', 'blob', `${ref}:${file}`], root);
      return Buffer.byteLength(text) <= maxBytes ? text : null;
    } catch {
      return null;
    }
  };

  const fetchContents = async (wanted: readonly DiffFile[]) => {
    const contents = new Map<string, FileContents>();
    await mapWithConcurrency(wanted, 8, async (file) => {
      const [before, after] = await Promise.all([
        file.oldPath ? readAt(base, file.oldPath) : Promise.resolve(null),
        file.newPath ? readAt(parsed.head, file.newPath) : Promise.resolve(null),
      ]);
      if (before !== null || after !== null) contents.set(file.path, { base: before, head: after });
    });
    return contents;
  };

  return { changeSet, fetchContents };
}
