import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMermaidBundle, MERMAID_INTEGRITY, MERMAID_VERSION } from '../src/mermaid-bundle';

const require = createRequire(import.meta.url);
const mermaidDir = path.dirname(require.resolve('mermaid/package.json'));
const bundle = () => readFile(path.join(mermaidDir, 'dist', 'mermaid.min.js'), 'utf8');

let cacheDir: string | undefined;
afterEach(async () => {
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
  cacheDir = undefined;
});

describe('Mermaid bundle pin', () => {
  it('pins the same version as the mermaid dev dependency', () => {
    expect(require('mermaid/package.json').version).toBe(MERMAID_VERSION);
  });

  it('pins the SRI hash of that version', async () => {
    const hash = createHash('sha384')
      .update(await bundle())
      .digest('base64');
    expect(`sha384-${hash}`).toBe(MERMAID_INTEGRITY);
  });
});

describe('loadMermaidBundle', () => {
  it('prefers a locally installed mermaid package', async () => {
    const fetch = vi.fn();
    const script = await loadMermaidBundle({ fetch });
    expect(script).toBe(await bundle());
    expect(fetch).not.toHaveBeenCalled();
  });

  it('downloads, verifies, and caches the pinned build', async () => {
    cacheDir = await mkdtemp(path.join(os.tmpdir(), 'lucidiff-test-'));
    const content = await bundle();
    const fetch = vi.fn(async () => new Response(content));
    const first = await loadMermaidBundle({ fetch, cacheDir, preferLocalPackage: false });
    const second = await loadMermaidBundle({ fetch, cacheDir, preferLocalPackage: false });
    expect(first).toBe(content);
    expect(second).toBe(content);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refuses a download that does not match the pinned hash', async () => {
    cacheDir = await mkdtemp(path.join(os.tmpdir(), 'lucidiff-test-'));
    const fetch = vi.fn(async () => new Response('globalThis.mermaid = "tampered";'));
    await expect(loadMermaidBundle({ fetch, cacheDir, preferLocalPackage: false })).rejects.toThrow(
      /does not match the pinned hash/,
    );
  });

  it('explains how to recover when the download fails', async () => {
    cacheDir = await mkdtemp(path.join(os.tmpdir(), 'lucidiff-test-'));
    const fetch = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    });
    await expect(loadMermaidBundle({ fetch, cacheDir, preferLocalPackage: false })).rejects.toThrow(
      /Connect to the network once/,
    );
  });
});
