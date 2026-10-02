/**
 * Provider-agnostic model selection through the Vercel AI SDK.
 *
 * Supported providers: Anthropic, OpenAI, and the Vercel AI Gateway (which routes to many
 * providers with one key). Library users can also pass any AI SDK `LanguageModel` directly to
 * `explain()` and skip this module.
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGateway } from '@ai-sdk/gateway';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { UserError } from '../errors';

export const PROVIDERS = ['anthropic', 'openai', 'gateway'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

/** The model each provider uses when none is given. */
export const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-5.5',
  gateway: 'anthropic/claude-opus-5-5',
};

/** Environment variables that hold credentials, per provider, in order of preference. */
export const PROVIDER_KEY_VARIABLES: Record<ProviderName, readonly string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  gateway: ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN'],
};

export type Effort = 'low' | 'medium' | 'high';

export interface ModelChoice {
  provider: ProviderName;
  modelId: string;
  model: LanguageModel;
}

export interface CreateModelOptions {
  /** Provider name. Defaults to `LUCIDIFF_PROVIDER`, then the first provider with a key set. */
  provider?: string;
  /** Model id. Defaults to `LUCIDIFF_MODEL`, then the provider's default model. */
  model?: string;
  /** Environment to read keys and defaults from. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

function hasKey(provider: ProviderName, env: NodeJS.ProcessEnv): boolean {
  return PROVIDER_KEY_VARIABLES[provider].some((name) => Boolean(env[name]?.trim()));
}

function isProvider(value: string): value is ProviderName {
  return (PROVIDERS as readonly string[]).includes(value);
}

/** Picks the provider: explicit choice, then LUCIDIFF_PROVIDER, then the first one with a key. */
export function resolveProvider(
  requested: string | undefined,
  env: NodeJS.ProcessEnv,
): ProviderName {
  const name = (requested ?? env.LUCIDIFF_PROVIDER)?.trim().toLowerCase();
  if (name) {
    if (!isProvider(name)) {
      throw new UserError(`Unknown provider "${name}". Use one of: ${PROVIDERS.join(', ')}.`);
    }
    return name;
  }
  const detected = PROVIDERS.find((provider) => hasKey(provider, env));
  if (!detected) {
    throw new UserError(
      'No LLM provider is configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or AI_GATEWAY_API_KEY, ' +
        'or pass --provider. See .env.example.',
    );
  }
  return detected;
}

/**
 * Creates an AI SDK language model from a provider name, a model id, and environment keys.
 *
 * @throws {UserError} when the provider is unknown or its API key is missing.
 */
export function createModel(options: CreateModelOptions = {}): ModelChoice {
  const env = options.env ?? process.env;
  const provider = resolveProvider(options.provider, env);
  if (!hasKey(provider, env)) {
    throw new UserError(
      `The ${provider} provider needs ${PROVIDER_KEY_VARIABLES[provider].join(' or ')} to be set.`,
    );
  }
  const modelId = (options.model ?? env.LUCIDIFF_MODEL)?.trim() || DEFAULT_MODELS[provider];

  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: env.ANTHROPIC_API_KEY,
        ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}),
      });
      return { provider, modelId, model: anthropic(modelId) };
    }
    case 'openai': {
      const openai = createOpenAI({
        apiKey: env.OPENAI_API_KEY,
        ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
      });
      return { provider, modelId, model: openai(modelId) };
    }
    case 'gateway': {
      const gateway = createGateway(
        env.AI_GATEWAY_API_KEY ? { apiKey: env.AI_GATEWAY_API_KEY } : {},
      );
      return { provider, modelId, model: gateway(modelId) };
    }
  }
}

/**
 * Provider options for a reasoning-effort setting. Each provider reads only its own key, so
 * it is safe to send all of them (the gateway forwards them to the underlying provider).
 */
export function effortProviderOptions(effort: Effort | undefined) {
  if (!effort) return undefined;
  return {
    anthropic: { effort },
    openai: { reasoningEffort: effort },
  };
}
