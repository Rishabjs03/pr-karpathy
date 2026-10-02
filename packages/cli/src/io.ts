import type { LanguageModel } from 'ai';

/**
 * Everything the CLI touches in the outside world, passed in explicitly so tests can run the
 * CLI in-process with fake streams, a fake environment, and a temporary directory.
 */
export interface CliIO {
  stdout: NodeJS.WritableStream & { isTTY?: boolean };
  stderr: NodeJS.WritableStream & { isTTY?: boolean };
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
  env: NodeJS.ProcessEnv;
  cwd: string;
  /** Opens a file in the default browser. */
  openFile: (file: string) => Promise<void>;
  /** Use this AI SDK model instead of creating one from flags and environment (tests, embedding). */
  languageModel?: LanguageModel;
}
