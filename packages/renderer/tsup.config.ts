import { defineConfig } from 'tsup';
import { rawImportPlugin } from '../../tsup.shared';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  treeshake: true,
  esbuildPlugins: [rawImportPlugin],
});
