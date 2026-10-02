/**
 * One structured model call: send a prompt, get back an object that matches a Zod schema.
 *
 * Calls stream, even though we only need the final object. Streaming keeps the connection
 * busy, so long generations on large PRs do not hit HTTP timeouts, and it lets the CLI show
 * progress. If the model returns JSON that does not match the schema, we retry once and tell
 * the model what was wrong.
 */
import {
  NoObjectGeneratedError,
  Output,
  streamText,
  type LanguageModel,
  type SystemModelMessage,
} from 'ai';
import type { z } from 'zod';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredCallOptions<T> {
  model: LanguageModel;
  schema: z.ZodType<T>;
  /** Name of the output, used by some providers as the tool or schema name. */
  schemaName: string;
  system: string;
  prompt: string;
  /** Maximum output tokens. Generous by default: truncated JSON is a wasted call. */
  maxOutputTokens?: number;
  providerOptions?: Record<string, Record<string, unknown>>;
  abortSignal?: AbortSignal;
  /** Called while the response streams, with the number of characters received so far. */
  onProgress?: (receivedCharacters: number) => void;
  /** Called with debug details, including the raw response text. Only wired up for --verbose. */
  onDebug?: (message: string) => void;
}

export interface StructuredCallResult<T> {
  output: T;
  usage: TokenUsage;
  /** Number of model requests made (2 when the first answer failed validation). */
  calls: number;
}

const DEFAULT_MAX_OUTPUT_TOKENS = 32_000;

/** The system prompt as a message, marked for prompt caching where the provider supports it. */
function systemMessage(system: string): SystemModelMessage {
  return {
    role: 'system',
    content: system,
    providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
  };
}

async function streamOnce<T>(
  options: StructuredCallOptions<T>,
  prompt: string,
): Promise<{ output: T; usage: TokenUsage; text: string }> {
  let streamError: unknown;
  const result = streamText({
    model: options.model,
    instructions: systemMessage(options.system),
    prompt,
    output: Output.object({ schema: options.schema, name: options.schemaName }),
    maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    ...(options.providerOptions ? { providerOptions: options.providerOptions as never } : {}),
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
    maxRetries: 2,
    onError: ({ error }) => {
      streamError = error;
    },
  });

  let text = '';
  for await (const delta of result.textStream) {
    text += delta;
    options.onProgress?.(text.length);
  }
  if (streamError) throw streamError;

  const [output, usage] = await Promise.all([result.output, result.totalUsage]);
  return {
    output: output as T,
    usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 },
    text,
  };
}

function isInvalidOutput(error: unknown): boolean {
  return (
    NoObjectGeneratedError.isInstance(error) ||
    (error instanceof Error &&
      /No (object|output) generated|Type validation failed|JSON/i.test(error.message))
  );
}

function describeInvalidOutput(error: unknown): string {
  const message =
    error instanceof Error
      ? error.cause instanceof Error
        ? error.cause.message
        : error.message
      : String(error);
  return message.length > 1500 ? `${message.slice(0, 1500)}…` : message;
}

/**
 * Calls the model with structured output and returns the validated object.
 *
 * @throws The provider error when the call fails, or a `NoObjectGeneratedError` when the model
 *   returns invalid output twice.
 */
export async function generateStructured<T>(
  options: StructuredCallOptions<T>,
): Promise<StructuredCallResult<T>> {
  try {
    const first = await streamOnce(options, options.prompt);
    options.onDebug?.(`Raw response (${options.schemaName}):\n${first.text}`);
    return { output: first.output, usage: first.usage, calls: 1 };
  } catch (error) {
    if (!isInvalidOutput(error)) throw error;
    const problem = describeInvalidOutput(error);
    options.onDebug?.(`Invalid ${options.schemaName} output, retrying once: ${problem}`);
    const retryPrompt =
      `${options.prompt}\n\n<previous_attempt_error>\nYour previous answer did not match the ` +
      `required JSON schema: ${problem}\nReturn one complete JSON object that matches the schema.\n` +
      `</previous_attempt_error>`;
    const second = await streamOnce(options, retryPrompt);
    options.onDebug?.(`Raw response (${options.schemaName}, retry):\n${second.text}`);
    return { output: second.output, usage: second.usage, calls: 2 };
  }
}
