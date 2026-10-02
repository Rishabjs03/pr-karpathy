import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// Resolve workspace packages to their TypeScript sources, so tests never need a build first.
// Tests run in Vite's server (SSR) environment, which has its own resolver conditions.
const conditions = ['@lucidiff/source', ...defaultServerConditions];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
