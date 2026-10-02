import { UserError } from '@lucidiff/core';
import { Command, CommanderError, Option } from 'commander';
import { explainCommand } from './commands/explain';
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

const collect = (value: string, previous: string[] = []) => [...previous, value];

const EXAMPLES = `
Examples:
  $ lucidiff https://github.com/owner/repo/pull/123 --open
  $ lucidiff owner/repo#123 -o review.html
  $ lucidiff --git main...feature-branch
  $ git diff | lucidiff --stdin
  $ lucidiff changes.patch --json > explainer.json
  $ lucidiff render explainer.json --open

Environment:
  ANTHROPIC_API_KEY, OPENAI_API_KEY, or AI_GATEWAY_API_KEY   credentials for the model provider
  GITHUB_TOKEN                                             private repositories, higher rate limits
  LUCIDIFF_PROVIDER, LUCIDIFF_MODEL                        defaults for --provider and --model
  lucidiff also reads these variables from a .env file in the current directory.

Privacy: lucidiff sends the diff (and, for PRs and git ranges, full changed files) to the
configured LLM provider after redacting likely secrets.
`;

/** Builds the commander program. Exported for tests. */
export function createProgram(io: CliIO, abortSignal?: AbortSignal): Command {
  const program = new Command(TOOL_NAME)
    .description('Turn a pull request into a self-contained, interactive HTML explainer.')
    .version(VERSION, '-V, --version')
    .argument('[input]', 'GitHub PR URL, owner/repo#123, diff file, or "-" for stdin')
    .option('-o, --output <file>', 'output file (default: <source>.explainer.html)')
    .option('--open', 'open the result in your browser')
    .option('--json', 'write the explainer JSON instead of HTML (to stdout unless -o is set)')
    .option(
      '--git [range]',
      'explain a local git range, e.g. main...feature (default: uncommitted changes)',
    )
    .option('--stdin', 'read a unified diff from stdin')
    .option('--provider <name>', 'LLM provider: anthropic, openai, or gateway')
    .option('--model <id>', 'model id (default depends on the provider)')
    .addOption(
      new Option('--effort <level>', 'reasoning effort for models that support it').choices([
        'low',
        'medium',
        'high',
      ]),
    )
    .option('--offline', 'embed Mermaid so the page works without network access')
    .option('--no-context', 'do not send full file contents, only the diff')
    .option('--ignore <glob>', 'skip files that match a glob (repeatable)', collect)
    .option(
      '--include <glob>',
      'always analyze files that match a glob, even if ignored (repeatable)',
      collect,
    )
    .option('--no-default-ignores', 'do not skip lockfiles, build output, and minified files')
    .option('--no-redact', 'do not redact likely secrets before sending (not recommended)')
    .option(
      '--max-input-tokens <n>',
      'token budget for one model call before splitting into batches',
    )
    .option('--verbose', 'print debug details, including raw model output')
    .addHelpText('after', EXAMPLES)
    .configureOutput({
      writeOut: (text) => io.stdout.write(text),
      writeErr: (text) => io.stderr.write(text),
    })
    .exitOverride()
    .action(async (input: string | undefined, options, command: Command) => {
      const globals = command.optsWithGlobals<GlobalOptions>();
      await explainCommand(
        input,
        options,
        io,
        makeLogger(io, Boolean(globals.verbose)),
        abortSignal,
      );
    });

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
export async function run(args: string[], io: CliIO, abortSignal?: AbortSignal): Promise<number> {
  const program = createProgram(io, abortSignal);
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
    if (abortSignal?.aborted) {
      logger.error('Cancelled.');
      return 130;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    if (!(error instanceof UserError)) {
      if (verbose && error instanceof Error && error.stack) logger.debug(error.stack);
      else logger.info('Run again with --verbose for details.');
    }
    return 1;
  }
}
