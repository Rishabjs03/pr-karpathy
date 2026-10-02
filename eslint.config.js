// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'examples/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'smart'],
      'no-console': 'off',
    },
  },
  {
    // Browser code that ships inside the generated HTML page.
    files: ['packages/renderer/src/assets/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, mermaid: 'readonly' },
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: ['packages/renderer/src/assets/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
