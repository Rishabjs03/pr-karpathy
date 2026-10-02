# @lucidiff/core

The pipeline behind [lucidiff](https://github.com/Rishabjs03/pr-karpathy#readme): it turns a
pull request or diff into a validated, structured explanation.

```ts
import { explain } from '@lucidiff/core';

const { document, droppedRisks, warnings } = await explain(
  { kind: 'github', url: 'https://github.com/owner/repo/pull/123' },
  { provider: 'anthropic' }, // or { model } with any Vercel AI SDK language model
);
```

- **Inputs:** `{ kind: 'github', url }`, `{ kind: 'git', range, cwd }`, `{ kind: 'diff', diff }`,
  or `{ kind: 'loaded', loaded }` to bring your own diff and metadata.
- **Output:** an `ExplainerDocument`, validated against the versioned Zod schema exported from
  `@lucidiff/core/schema` (that entry point imports only `zod`).
- **Accuracy:** every risk cites a file and line range that is checked against the diff;
  invalid citations are dropped and reported in `droppedRisks`.
- **Safety:** lockfiles, binaries, and generated files are skipped, and likely secrets are
  redacted before anything is sent to the model.

Render the document with [`@lucidiff/renderer`](https://www.npmjs.com/package/@lucidiff/renderer).
Install `mermaid` next to this package to also validate flow diagrams with Mermaid's parser.

MIT License.
