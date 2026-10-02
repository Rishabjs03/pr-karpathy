import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadMermaidBundle, renderHtml, type MermaidAsset } from '@lucidiff/renderer';
import type { CliIO } from '../io';
import type { Logger } from '../logger';
import { writeOutputFile } from '../output';

export interface RenderCommandOptions {
  output?: string;
  open?: boolean;
  offline?: boolean;
}

/** Resolves how the page should load Mermaid, downloading the bundle for --offline if needed. */
export async function resolveMermaid(offline: boolean, logger: Logger): Promise<MermaidAsset> {
  if (!offline) return { kind: 'cdn' };
  const script = await loadMermaidBundle({ onStatus: (message) => logger.info(message) });
  return { kind: 'inline', script };
}

/** `lucidiff render <file.json>`: renders a saved explainer document (from --json) to HTML. */
export async function renderCommand(
  file: string,
  options: RenderCommandOptions,
  io: CliIO,
  logger: Logger,
): Promise<void> {
  const inputPath = path.resolve(io.cwd, file);
  let document: unknown;
  try {
    document = JSON.parse(await readFile(inputPath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${file} as JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }
  const mermaid = await resolveMermaid(Boolean(options.offline), logger);
  const page = renderHtml(document, { mermaid });
  const output = options.output ?? `${file.replace(/\.json$/i, '')}.html`;
  const written = await writeOutputFile(io.cwd, output, page);
  logger.info(`Wrote ${path.relative(io.cwd, written) || written}`);
  if (options.open) await io.openFile(written);
}
