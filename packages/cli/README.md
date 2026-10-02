# lucidiff

Turn a pull request into a self-contained, interactive HTML explainer: a summary, per-file
changes, a flow diagram, cited risks, and a reviewer checklist.

```sh
export ANTHROPIC_API_KEY=sk-ant-...        # or OPENAI_API_KEY, or AI_GATEWAY_API_KEY
npx lucidiff https://github.com/owner/repo/pull/123 --open
```

```sh
lucidiff owner/repo#123 -o review.html     # a GitHub PR
lucidiff --git main...feature-branch       # a local git range
git diff | lucidiff --stdin                # any unified diff
lucidiff changes.patch --json              # the validated JSON instead of HTML
lucidiff render explainer.json --open      # render saved JSON
```

Run `lucidiff --help` for all options.

**Privacy:** lucidiff sends the diff (and, for PRs and git ranges, the full contents of changed
files) to the LLM provider you configure, after redacting likely secrets.

Full documentation, examples, and the library API:
[github.com/Rishabjs03/pr-karpathy](https://github.com/Rishabjs03/pr-karpathy#readme).

MIT License.
