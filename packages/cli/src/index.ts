/**
 * The lucidiff command-line interface. Most people use the `lucidiff` binary; this module
 * exports `run` so the CLI can be embedded or tested in-process.
 */
export { run, createProgram } from './cli';
export type { CliIO } from './io';
export { VERSION } from './version';
