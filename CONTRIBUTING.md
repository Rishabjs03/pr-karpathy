# Contributing to lucidiff

Thanks for your interest in lucidiff. This guide explains how the project is organized, how to
run it locally, and what we look for in a pull request.

## Ground rules

- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- Open an issue before you start a large change, so we can agree on the approach first.
- Never commit API keys, tokens, or private code, including in test fixtures.

## Setup

You need Node.js 22.12 or later and pnpm 10 (`corepack enable` installs the version pinned in
`package.json`).

```sh
git clone https://github.com/Rishabjs03/pr-karpathy.git
cd pr-karpathy
pnpm install
pnpm check     # lint, format check, typecheck, tests, build
```

To run the CLI from source after a build:

```sh
pnpm build
node packages/cli/dist/bin.js --help
```

## Repository layout

```
packages/
  core/       @lucidiff/core      Pipeline, schemas, LLM calls, validation. No HTML.
    src/schema/      Zod schemas: what the model writes (llm.ts) and the final document (document.ts)
    src/prompts/     The system prompts. The most important files in the project.
    src/flow/        Flow graph validation and the graph → Mermaid compiler
  renderer/   @lucidiff/renderer  Explainer document → one self-contained HTML file
    src/components/  One file per page section
    src/assets/      CSS and browser JS, inlined into every page
  cli/        lucidiff            The command-line interface
fixtures/     Shared test fixtures (diffs and documents)
examples/     Real PRs with their generated explainers, committed on purpose
scripts/      Development scripts (sample rendering, screenshots, examples)
```

The core rule of the architecture: **the model never writes HTML or Mermaid.** It fills a JSON
schema. The pipeline validates that JSON, and the renderer turns it into a page. Keep each layer
on its side of that line.

## Common tasks

| Task                                           | Command                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| Run all checks                                 | `pnpm check`                                                          |
| Run tests in watch mode                        | `pnpm test:watch`                                                     |
| Update renderer snapshots after a UI change    | `pnpm test:update`                                                    |
| Render the sample page to `.sample/`           | `pnpm sample` (add `--offline` to embed Mermaid)                      |
| Screenshot a page in light and dark mode       | `node scripts/screenshot.mjs .sample/sample.html .sample/shot --full` |
| Recompile the sample flow after compiler edits | `node scripts/update-sample-flow.mjs`                                 |
| Regenerate the examples (replay, no API key)   | `pnpm examples`                                                       |
| Regenerate the examples with a live model      | `pnpm build && node scripts/generate-examples.mjs --live`             |
| Regenerate the README screenshots              | `node scripts/readme-images.mjs`                                      |
| Add a changeset                                | `pnpm changeset`                                                      |

### Working on the page design

`fixtures/sample-document.json` is a hand-written explainer that uses every part of the page.
Run `pnpm sample`, open `.sample/sample.html`, and iterate on
`packages/renderer/src/assets/styles.css` and `packages/renderer/src/components/`. Check both
themes, a narrow window, and print preview. Then run `pnpm test:update` and review the snapshot
diff.

### Examples

`examples/` holds three real PRs with their generated explainers. After a renderer or pipeline
change, run `pnpm examples` to re-render them from the stored model answers, and
`node scripts/readme-images.mjs` if the README screenshots should change. The examples site
workflow (`.github/workflows/pages.yml`) publishes the folder to GitHub Pages once Pages is
enabled and the `PAGES_ENABLED` repository variable is `true`.

### Working on the prompts

The prompts live in `packages/core/src/prompts/`. Each rule there exists for a reason that is
written next to it. When you change a prompt:

1. Explain the failure you saw (ideally with a public PR that shows it) in the PR description.
2. Run `node scripts/generate-examples.mjs --live` before and after, and compare the output.
3. Keep the writing-style rules in sync with the README.

### Tests

- Tests live in `packages/*/test/` and run with Vitest. They import workspace packages from
  source, so you do not need to build first.
- Tests never call a real model. Use the helpers in `packages/core/test/helpers.ts` to create a
  mock model that returns fixed JSON.
- Fixture diffs live in `fixtures/diffs/`. Add one when you fix a parsing bug.

## Pull requests

- Keep each PR focused on one change.
- Add or update tests for every behavior change.
- Add a changeset (`pnpm changeset`) when you change a published package. Pick `patch` for fixes,
  `minor` for new features. The three packages share one version.
- Run `pnpm check` before you push. CI runs the same checks on Node 22 and 24.
- Use clear commit messages in the imperative mood ("Add rename support to the diff parser").

## Releasing (maintainers)

Merging to `main` runs the release workflow. When changesets are pending, it opens a "Version
packages" PR. Merging that PR publishes the new versions to npm with provenance. The workflow
needs an `NPM_TOKEN` repository secret, and runs only when the repository variable
`RELEASE_ENABLED` is `true`. To let it open the PR, turn on "Allow GitHub Actions to create
and approve pull requests" in Settings → Actions → General.
