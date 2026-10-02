import { readFileSync } from 'node:fs';
import { MockLanguageModelV4 } from 'ai/test';

/** Reads a fixture diff from fixtures/diffs. */
export function fixtureDiff(name: string): string {
  return readFileSync(new URL(`../../../fixtures/diffs/${name}`, import.meta.url), 'utf8');
}

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: 0 },
});

export interface MockCall {
  /** The structured output name, e.g. "pr_explanation" or "flow_graph". */
  schemaName: string | undefined;
  /** The user message text. */
  prompt: string;
  index: number;
}

/**
 * Creates a mock language model that streams JSON responses.
 *
 * Pass an array to return the values in call order (the last one repeats), or a function to
 * choose a response from the call. A string response is streamed as raw (possibly invalid)
 * text instead of JSON.
 */
export function mockModel(
  responses: unknown[] | ((call: MockCall) => unknown),
  options: { modelId?: string } = {},
) {
  let call = 0;
  const model = new MockLanguageModelV4({
    provider: 'mock',
    modelId: options.modelId ?? 'mock-model',
    doStream: async (callOptions) => {
      const format = callOptions.responseFormat as { name?: string } | undefined;
      const userText = callOptions.prompt
        .filter((message) => message.role === 'user')
        .flatMap((message) => message.content)
        .map((part) => ('text' in part ? part.text : ''))
        .join('\n');
      const value =
        typeof responses === 'function'
          ? responses({ schemaName: format?.name, prompt: userText, index: call })
          : responses[Math.min(call, responses.length - 1)];
      call += 1;
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      const chunks = text.match(/[\s\S]{1,200}/g) ?? [''];
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 't1' });
            for (const delta of chunks) controller.enqueue({ type: 'text-delta', id: 't1', delta });
            controller.enqueue({ type: 'text-end', id: 't1' });
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: usage(1000, Math.ceil(text.length / 4)),
            });
            controller.close();
          },
        }),
      };
    },
  });
  return model;
}
