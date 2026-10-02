#!/usr/bin/env node
import { run } from './cli';
import { openWithSystem } from './open';

process.exitCode = await run(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
  env: process.env,
  cwd: process.cwd(),
  openFile: openWithSystem,
});
