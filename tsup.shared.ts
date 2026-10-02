import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'esbuild';

/**
 * Lets source files import any file as a string with a `?raw` suffix,
 * the same convention Vite (and therefore Vitest) supports natively.
 */
export const rawImportPlugin: Plugin = {
  name: 'raw-import',
  setup(build) {
    // Keep the `?raw` suffix on the resolved path so that no other plugin that filters on
    // the file extension (such as tsup's CSS handling) claims the file.
    build.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: `${path.resolve(args.resolveDir, args.path.replace(/\?raw$/, ''))}?raw`,
      namespace: 'raw-file',
    }));
    build.onLoad({ filter: /\?raw$/, namespace: 'raw-file' }, async (args) => ({
      contents: await readFile(args.path.replace(/\?raw$/, ''), 'utf8'),
      loader: 'text',
    }));
  },
};
