import type { LanguageModel } from 'ai';
import { generateStructured, type StructuredCallOptions, type TokenUsage } from '../llm/generate';

export { mapWithConcurrency } from '../util/concurrency';

/** What every analysis step needs to call the model and report progress. */
export interface AnalysisContext {
  model: LanguageModel;
  providerOptions?: Record<string, Record<string, unknown>>;
  abortSignal?: AbortSignal;
  /** Concurrent batch calls in batched mode. */
  concurrency: number;
  onProgress: (message: string) => void;
  onDebug: (message: string) => void;
  usage: UsageTracker;
}

/** Adds up token usage and request counts across all model calls of one run. */
export class UsageTracker {
  inputTokens = 0;
  outputTokens = 0;
  calls = 0;

  add(usage: TokenUsage, calls: number): void {
    this.inputTokens += usage.inputTokens;
    this.outputTokens += usage.outputTokens;
    this.calls += calls;
  }
}

/** Runs a structured call with the shared model settings and records its usage. */
export async function callModel<T>(
  context: AnalysisContext,
  options: Pick<
    StructuredCallOptions<T>,
    'schema' | 'schemaName' | 'system' | 'prompt' | 'maxOutputTokens' | 'onProgress'
  >,
): Promise<T> {
  const result = await generateStructured({
    ...options,
    model: context.model,
    ...(context.providerOptions ? { providerOptions: context.providerOptions } : {}),
    ...(context.abortSignal ? { abortSignal: context.abortSignal } : {}),
    onDebug: context.onDebug,
  });
  context.usage.add(result.usage, result.calls);
  return result.output;
}

/** Formats a character count as an approximate token count for progress messages. */
export function approxTokens(characters: number): string {
  const tokens = Math.round(characters / 4);
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}
