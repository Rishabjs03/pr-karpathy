import { Command, CommanderError } from 'commander';
import { renderCommand } from './commands/render';
import type { CliIO } from './io';
import { createLogger, type Logger } from './logger';
import { TOOL_NAME, VERSION } from './version';

interface GlobalOptions {
  verbose?: boolean;
}

function makeLogger(io: CliIO, verbose: boolean): Logger {
  return createLogger({ stream: io.stderr, verbose, plain: io.env.LUCIDIFF_PLAIN_OUTPUT === '1' });
}

/** Builds the commander program. Exported for tests. */
export function createProgram(io: CliIO): Command {
  const program = new Command(TOOL_NAME)
    .description('Turn a pull request into a self-contained, interactive HTML explainer.')
    .version(VERSION, '-V, --version')
    .option('--verbose', 'print debug details, including raw model output')
    .configureOutput({
      writeOut: (text) => io.stdout.write(text),
      writeErr: (text) => io.stderr.write(text),
    })
    .exitOverride();

  program
    .command('render')
    .description('render a saved explainer document (from --json) to HTML')
    .argument('<file>', 'explainer JSON file')
    .option('-o, --output <file>', 'output HTML file (default: <file>.html)')
    .option('--open', 'open the result in your browser')
    .option('--offline', 'embed Mermaid so the page works without network access')
    .action(async (file: string, options, command: Command) => {
      const globals = command.optsWithGlobals<GlobalOptions>();
      await renderCommand(file, options, io, makeLogger(io, Boolean(globals.verbose)));
    });

  return program;
}

/**
 * Runs the CLI with the given arguments (without the `node` and script entries).
 *
 * @returns The process exit code.
 */
export async function run(args: string[], io: CliIO): Promise<number> {
  const program = createProgram(io);
  try {
    await program.parseAsync(args, { from: 'user' });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      // Commander already printed help, the version, or a usage error.
      return error.exitCode;
    }
    const verbose = args.includes('--verbose');
    const logger = makeLogger(io, verbose);
    logger.error((error as Error).message);
    if (verbose && error instanceof Error && error.stack) logger.debug(error.stack);
    return 1;
  }
}
