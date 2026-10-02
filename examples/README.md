# Examples

Explainers for three real, merged pull requests, committed so you can see lucidiff's output
without installing anything. Download any `index.html` and open it in a browser. The pages
load Mermaid from a pinned CDN build for the flow diagram; offline, they show the flow as a
text list instead.

| Folder                                                | Pull request                                                                                                                              | Size               | Highlights                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| [`ky-880-signal-replace`](ky-880-signal-replace/)     | [sindresorhus/ky#880](https://github.com/sindresorhus/ky/pull/880): Fix `signal` replacement when extending instances                     | 4 files, +79 −7    | A small fix. One low risk: `signal: null` still inherits the parent signal.                       |
| [`click-3777-pager-params`](click-3777-pager-params/) | [pallets/click#3777](https://github.com/pallets/click/pull/3777): Forward all user's parameters set in `PAGER` and improve flag detection | 3 files, +227 −12  | A medium risk: a dashless `LESS=FRX` (Git's default) no longer keeps colors.                      |
| [`ky-842-network-error`](ky-842-network-error/)       | [sindresorhus/ky#842](https://github.com/sindresorhus/ky/pull/842): Add `NetworkError` class and tighten retry logic                      | 15 files, +397 −47 | A breaking change for callers that check `TypeError`, and lost retries for custom `fetch` errors. |

Each folder contains:

| File                | Contents                                                                |
| ------------------- | ----------------------------------------------------------------------- |
| `source.json`       | The PR URL, title, base branch, merge commit, and the project's license |
| `pr.diff`           | The PR diff, as `git diff` prints it for the PR's commits               |
| `model-output.json` | The model's answer: JSON that matches `ExplanationSchema`               |
| `explainer.json`    | The validated explainer document (generated)                            |
| `index.html`        | The rendered page (generated)                                           |

## How these were made

The diffs come from the projects' public git history. The explanations in
`model-output.json` were written by `claude-opus-5-5` following lucidiff's system prompt, in
the development session that built lucidiff. That environment had no provider API key, so the
answers were not produced by running the `lucidiff` CLI against the API. The page footers say so:
the provider reads `replay` and token usage reads "Not reported".

Every other step is the real pipeline. `pnpm examples` replays the stored answers through
`explain()`: the diff parser, change merging, risk citation validation (no risk was dropped),
flow validation and compilation to Mermaid, checklist cleanup, schema validation, and the
renderer. Each risk was also checked by running the PR's own code; for example,
`_less_uses_raw_mode("FRX", [])` returns `False` at the PR's head commit.

To regenerate them with a live model call, set a provider key and run:

```sh
pnpm build
node scripts/generate-examples.mjs --live
```

Live runs fetch each PR from the GitHub API, including full file contents, so the results will
differ from the committed replays.

## Licenses

The diffs in this folder are excerpts of third-party projects, included to demonstrate
lucidiff. They remain under their projects' licenses:

- [sindresorhus/ky](https://github.com/sindresorhus/ky): MIT License, © Sindre Sorhus
- [pallets/click](https://github.com/pallets/click): BSD-3-Clause License, © Pallets
