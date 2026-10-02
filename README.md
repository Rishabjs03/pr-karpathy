# lucidiff

**Turn a pull request into a self-contained, interactive HTML explainer.**

> Work in progress. The full README is written at the end of milestone 5.

lucidiff reads a pull request (or any diff) and produces one HTML file with a summary, a per-file
breakdown, a flow diagram, cited risks, and a reviewer checklist. The model fills a validated
JSON schema; a fixed template renders it.

## Development

```sh
pnpm install
pnpm check
pnpm sample   # renders fixtures/sample-document.json to .sample/sample.html
```

See [CONTRIBUTING.md](CONTRIBUTING.md).
