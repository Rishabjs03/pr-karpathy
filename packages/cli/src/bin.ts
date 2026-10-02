#!/usr/bin/env node
import { run } from './cli';
import { openWithSystem } from './open';

// Exit quietly when the reader goes away, e.g. `lucidiff --help | head`.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') process.exit(0);
    throw error;
  });
}

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());

process.exitCode = await run(
  process.argv.slice(2),
  {
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    env: process.env,
    cwd: process.cwd(),
    openFile: openWithSystem,
  },
  controller.signal,
);
