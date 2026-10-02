import path from 'node:path';
import {
  explain,
  UserError,
  type Effort,
  type ExplainOptions,
  type PipelineStage,
} from '@lucidiff/core';
import { renderHtml } from '@lucidiff/renderer';
import { withDotEnv } from '../env';
import { resolveInput, type InputFlags } from '../input';
import type { CliIO } from '../io';
import type { Logger, StageHandle } from '../logger';
import { defaultOutputName, writeOutputFile } from '../output';
import { resolveMermaid } from './render';

export interface ExplainCommandOptions extends InputFlags {
  output?: string;
  open?: boolean;
  json?: boolean;
  offline?: boolean;
  provider?: string;
  model?: string;
  effort?: string;
  context?: boolean;
  ignore?: string[];
  include?: string[];
  defaultIgnores?: boolean;
  redact?: boolean;
  maxInputTokens?: string;
}

const EFFORTS = ['low', 'medium', 'high'];

function parsePositiveInteger(value: string, flag: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0)
    throw new UserError(`${flag} must be a positive integer.`);
  return number;
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/** `lucidiff <input>`: explains a PR or diff and writes the HTML page (or JSON). */
export async function explainCommand(
  argument: string | undefined,
  options: ExplainCommandOptions,
  io: CliIO,
  logger: Logger,
  abortSignal?: AbortSignal,
): Promise<void> {
  if (options.effort && !EFFORTS.includes(options.effort)) {
    throw new UserError(`--effort must be one of: ${EFFORTS.join(', ')}.`);
  }
  if (options.open && options.json) throw new UserError('--open cannot be used with --json.');

  const env = await withDotEnv(io.env, io.cwd);
  const input = await resolveInput(argument, options, io);

  const handles = new Map<PipelineStage, StageHandle>();
  const explainOptions: ExplainOptions = {
    env,
    ...(io.languageModel ? { model: io.languageModel } : {}),
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.model ? { modelId: options.model } : {}),
    ...(options.effort ? { effort: options.effort as Effort } : {}),
    context: options.context !== false,
    redact: options.redact !== false,
    defaultIgnores: options.defaultIgnores !== false,
    ...(options.ignore ? { ignore: options.ignore } : {}),
    ...(options.include ? { include: options.include } : {}),
    ...(options.maxInputTokens
      ? {
          budget: {
            maxInputTokens: parsePositiveInteger(options.maxInputTokens, '--max-input-tokens'),
          },
        }
      : {}),
    github: {
      ...(env.GITHUB_TOKEN || env.GH_TOKEN ? { token: env.GITHUB_TOKEN || env.GH_TOKEN } : {}),
      ...(env.GITHUB_API_URL ? { apiUrl: env.GITHUB_API_URL } : {}),
    },
    ...(abortSignal ? { abortSignal } : {}),
    onProgress: (event) => {
      if (event.type === 'start') handles.set(event.stage, logger.stage(event.message));
      else if (event.type === 'update') handles.get(event.stage)?.update(event.message);
      else handles.get(event.stage)?.succeed(event.message);
    },
    onDebug: (message) => logger.debug(message),
  };

  if (options.redact === false)
    logger.warn('Secret redaction is off. The full diff is sent to the model as is.');

  let result: Awaited<ReturnType<typeof explain>>;
  try {
    result = await explain(input, explainOptions);
  } catch (error) {
    for (const handle of handles.values()) handle.fail();
    throw error;
  }
  const { document, warnings } = result;
  for (const warning of warnings) logger.warn(warning);

  const fromStdin = input.kind === 'diff' && input.label === 'stdin';

  if (options.json) {
    const json = `${JSON.stringify(document, null, 2)}\n`;
    if (options.output) {
      const written = await writeOutputFile(io.cwd, options.output, json);
      logger.info(`Wrote ${path.relative(io.cwd, written) || written}`);
    } else {
      io.stdout.write(json);
    }
  } else {
    const render = logger.stage('Rendering HTML');
    const mermaid = await resolveMermaid(Boolean(options.offline), logger);
    const page = renderHtml(document, { mermaid });
    const output =
      options.output ??
      (fromStdin ? 'explainer.html' : defaultOutputName(document.meta.source.label, 'html'));
    const written = await writeOutputFile(io.cwd, output, page);
    render.succeed(path.relative(io.cwd, written) || written);
    if (options.open) await io.openFile(written);
  }

  const { usage } = document.meta;
  logger.info(
    `Tokens: ${formatCount(usage.input_tokens)} input · ${formatCount(usage.output_tokens)} output · ${usage.llm_calls} model call${usage.llm_calls === 1 ? '' : 's'} (${document.meta.model})`,
  );
}
