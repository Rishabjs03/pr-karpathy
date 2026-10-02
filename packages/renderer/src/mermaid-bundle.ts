/**
 * How the generated page gets Mermaid, the library that draws the flow diagram.
 *
 * By default the page loads a pinned Mermaid build from the jsDelivr CDN, protected by a
 * Subresource Integrity hash. With `--offline`, the page embeds the same build, so it works
 * with no network access. `loadMermaidBundle` finds that build without making Mermaid (about
 * 120 MB unpacked) a dependency of this package.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

/** Keep these three values in sync. A unit test checks the hash against the dev dependency. */
export const MERMAID_VERSION = '12.1.0';
export const MERMAID_INTEGRITY =
  'sha384-EbBpjO7rlR6eqZEcG7GaPpyk9H9WrMyPWX4d3KvPYltgt8Z8l0z6R56B1qP40pR4';
export const MERMAID_CDN_URL = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`;

/** Where the page gets Mermaid from. */
export type MermaidAsset =
  /** Load from the CDN with an SRI hash (default). */
  | { kind: 'cdn' }
  /** Embed the given Mermaid browser bundle in the page. */
  | { kind: 'inline'; script: string }
  /** Do not load Mermaid. The page shows the text version of the flow. */
  | { kind: 'none' };

export interface LoadMermaidOptions {
  /** Directory for the downloaded bundle. Defaults to `$XDG_CACHE_HOME/lucidiff` or `~/.cache/lucidiff`. */
  cacheDir?: string;
  /** Fetch implementation, for tests. */
  fetch?: typeof globalThis.fetch;
  /** Called with a short status message, e.g. when a download starts. */
  onStatus?: (message: string) => void;
  /** Use a locally installed `mermaid` package when one exists. Defaults to true. */
  preferLocalPackage?: boolean;
}

function integrityOf(content: string): string {
  return `sha384-${createHash('sha384').update(content).digest('base64')}`;
}

function defaultCacheDir(): string {
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(base, 'lucidiff');
}

/** Reads the bundle from a locally installed `mermaid` package, if there is one. */
async function readLocalPackage(): Promise<string | null> {
  try {
    const require = createRequire(import.meta.url);
    const packageJson = require.resolve('mermaid/package.json');
    return await readFile(path.join(path.dirname(packageJson), 'dist', 'mermaid.min.js'), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Returns the Mermaid browser bundle as a string, for embedding with `{ kind: 'inline' }`.
 *
 * Lookup order:
 * 1. A locally installed `mermaid` package (any version).
 * 2. The cached download of the pinned version.
 * 3. A download of the pinned version from jsDelivr. The download must match the pinned SRI
 *    hash before it is cached or used.
 *
 * @throws {Error} when the bundle cannot be found or downloaded, or the hash does not match.
 */
export async function loadMermaidBundle(options: LoadMermaidOptions = {}): Promise<string> {
  if (options.preferLocalPackage ?? true) {
    const local = await readLocalPackage();
    if (local) return local;
  }

  const cacheFile = path.join(
    options.cacheDir ?? defaultCacheDir(),
    `mermaid-${MERMAID_VERSION}.min.js`,
  );
  try {
    const cached = await readFile(cacheFile, 'utf8');
    if (integrityOf(cached) === MERMAID_INTEGRITY) return cached;
  } catch {
    // Not cached yet.
  }

  options.onStatus?.(`Downloading Mermaid ${MERMAID_VERSION} for offline use`);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchImpl(MERMAID_CDN_URL);
  } catch (error) {
    throw new Error(
      `Could not download Mermaid for --offline (${(error as Error).message}). ` +
        'Connect to the network once, or install the "mermaid" package next to lucidiff.',
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new Error(`Could not download Mermaid for --offline: HTTP ${response.status}.`);
  }
  const content = await response.text();
  const integrity = integrityOf(content);
  if (integrity !== MERMAID_INTEGRITY) {
    throw new Error(
      `The downloaded Mermaid bundle does not match the pinned hash (got ${integrity}). Refusing to use it.`,
    );
  }
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, content, 'utf8');
  return content;
}
