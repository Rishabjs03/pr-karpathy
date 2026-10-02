import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parsePullRequestReference, UserError, type ExplainInput } from '@lucidiff/core';
import type { CliIO } from './io';

export interface InputFlags {
  git?: string | boolean;
  stdin?: boolean;
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Works out what to explain from the positional argument and flags:
 *
 *   --git [range]         a local git range
 *   --stdin, or "-"       a diff on stdin
 *   a PR URL or o/r#123   a GitHub pull request
 *   a file path           a diff or patch file
 *   (nothing, piped)      a diff on stdin
 */
export async function resolveInput(
  argument: string | undefined,
  flags: InputFlags,
  io: CliIO,
): Promise<ExplainInput> {
  if (flags.git !== undefined && flags.git !== false) {
    if (argument) throw new UserError('Pass either a PR URL or file, or --git, not both.');
    return { kind: 'git', range: typeof flags.git === 'string' ? flags.git : '', cwd: io.cwd };
  }
  if (flags.stdin || argument === '-') {
    return { kind: 'diff', diff: await readStream(io.stdin), label: 'stdin' };
  }
  if (argument) {
    if (parsePullRequestReference(argument)) return { kind: 'github', url: argument };
    if (/^https?:\/\//i.test(argument)) {
      throw new UserError(
        `"${argument}" is not a pull request URL. Expected https://github.com/owner/repo/pull/123.`,
      );
    }
    const file = path.resolve(io.cwd, argument);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) throw new UserError(`File not found: ${argument}`);
    return { kind: 'diff', diff: await readFile(file, 'utf8'), label: path.basename(argument) };
  }
  if (!io.stdin.isTTY) return { kind: 'diff', diff: await readStream(io.stdin), label: 'stdin' };
  throw new UserError(
    'Nothing to explain. Pass a PR URL, a diff file, --git <range>, or pipe a diff into lucidiff.\nRun "lucidiff --help" for examples.',
  );
}
