# Examples

Explainers for three real, merged pull requests, committed so you can see lucidiff's output
without installing anything. Download any `index.html` and open it in a browser. The pages
load Mermaid from a pinned CDN build for the flow diagram; offline, they show the flow as a
text list instead.

| Folder                                                | Pull request                                                                                                                              | Size               | Highlights                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| [`ky-880-signal-replace`](ky-880-signal-replace/)     | [sindresorhus/ky#880](https://github.com/sindresorhus/ky/pull/880): Fix `signal` replacement when extending instances                     | 4 files, +79 −7    | A medium risk: a per-request `signal: undefined` now drops the instance's signal.                 |
| [`click-3777-pager-params`](click-3777-pager-params/) | [pallets/click#3777](https://github.com/pallets/click/pull/3777): Forward all user's parameters set in `PAGER` and improve flag detection | 3 files, +227 −12  | A medium risk: a dashless `LESS=FRX` (Git's default) no longer keeps colors. Two low risks.       |
| [`ky-842-network-error`](ky-842-network-error/)       | [sindresorhus/ky#842](https://github.com/sindresorhus/ky/pull/842): Add `NetworkError` class and tighten retry logic                      | 15 files, +397 −47 | A breaking change for callers that check `TypeError`, and lost retries for custom `fetch` errors. |

Each folder contains:

| File                | Contents                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `source.json`       | The PR URL, title, base branch, merge commit, and the project's license, and `run`: the provider, model, time, and token usage of the live call |
| `pr.diff`           | The PR diff, as `git diff` prints it for the PR's commits                                                                                       |
| `model-output.json` | The model's answer: JSON that matches `ExplanationSchema`                                                                                       |
| `explainer.json`    | The validated explainer document (generated)                                                                                                    |
| `index.html`        | The rendered page (generated)                                                                                                                   |

## How these were made

The diffs come from the projects' public git history. Each `model-output.json` is the answer
from a live run of the CLI on that `pr.diff` against the Anthropic API, on 2026-10-02:

```sh
lucidiff examples/<name>/pr.diff --verbose
```

The model was `claude-opus-5-5`, the default, with no PR description and no full-file context,
because the input was a diff file. Token usage is in `source.json` and in each page footer.
No risk was dropped by citation validation, and no flow diagram needed a repair call.

`pnpm examples` replays the stored answers through the same pipeline: the diff parser, change
merging, risk citation validation, flow validation and compilation to Mermaid, checklist
cleanup, schema validation, and the renderer. It needs no API key, so the pages can be
regenerated after renderer changes. The replay adds the PR's title and link from
`source.json` to the page header.

Each risk was checked against the PR's own code:

- **ky#880.** At the PR's merge commit, `ky.create({signal}).get(url, {signal: undefined})`
  sends a request whose signal does not abort with the instance's signal. Before the PR, it
  did.
- **click#3777.** `_less_uses_raw_mode("FRX", [])` returns `False`, so `LESS=FRX` loses
  colors. `("", ["--raw"])` returns `False`, although less accepts `--raw`. `("-+R", [])` and
  `("-pError", [])` return `True`, which are false positives.
- **ky#842.** A `fetch` that throws `TypeError` now reaches the caller as `NetworkError`,
  which is not an `instanceof TypeError`. A custom `fetch` that throws a plain `Error` is
  called once with `retry: {limit: 2}`, not three times as before. `isNetworkError` returns
  `true` for `new DOMException('offline', 'NetworkError')`.

To get new answers from a live model, set a provider key and run:

```sh
pnpm build
node scripts/generate-examples.mjs --live
```

This sends each `pr.diff` to the model, as the command above does, saves the answer and its
token usage, and replays it. Model output varies between runs, so the risks can differ.

## Licenses

The diffs in this folder are excerpts of third-party projects, included to demonstrate
lucidiff. They remain under their projects' licenses:

- [sindresorhus/ky](https://github.com/sindresorhus/ky): MIT License, © Sindre Sorhus
- [pallets/click](https://github.com/pallets/click): BSD-3-Clause License, © Pallets
