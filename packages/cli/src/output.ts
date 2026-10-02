import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Writes a file relative to `cwd`, creating parent directories. Returns the absolute path. */
export async function writeOutputFile(cwd: string, file: string, content: string): Promise<string> {
  const target = path.resolve(cwd, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
  return target;
}

/** Turns a source label like "acme/api#42" or "main...feature" into a safe file name. */
export function defaultOutputName(label: string, extension: 'html' | 'json'): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'explainer'}.explainer.${extension}`;
}
