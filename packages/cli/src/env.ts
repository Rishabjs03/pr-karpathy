import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Variables lucidiff reads from a `.env` file. Everything else in the file is ignored, so the
 * CLI never loads unrelated application secrets into its process.
 */
const ALLOWED =
  /^(?:ANTHROPIC_API_KEY|ANTHROPIC_BASE_URL|OPENAI_API_KEY|OPENAI_BASE_URL|AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN|GITHUB_TOKEN|GH_TOKEN|GITHUB_API_URL|LUCIDIFF_[A-Z_]+)$/;

/**
 * Returns a copy of `env` with lucidiff's variables from `<cwd>/.env` added. Variables that
 * are already set win over the file.
 */
export async function withDotEnv(env: NodeJS.ProcessEnv, cwd: string): Promise<NodeJS.ProcessEnv> {
  let text: string;
  try {
    text = await readFile(path.join(cwd, '.env'), 'utf8');
  } catch {
    return { ...env };
  }
  const merged = { ...env };
  for (const [key, value] of Object.entries(parseEnv(text))) {
    if (ALLOWED.test(key) && merged[key] === undefined) merged[key] = value;
  }
  return merged;
}
