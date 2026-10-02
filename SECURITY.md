# Security policy

## Supported versions

Security fixes go into the latest minor release. Please upgrade before you report an issue.

## Report a vulnerability

Please do **not** open a public issue for security problems.

Report them privately through GitHub:
[Security → Report a vulnerability](https://github.com/Rishabjs03/pr-karpathy/security/advisories/new).

Include what you found, how to reproduce it, and what an attacker could do with it. You will get
a first response within 5 working days. We will keep you updated until the issue is fixed and
credit you in the release notes, unless you prefer to stay anonymous.

## What counts as a security issue

lucidiff reads untrusted input (pull requests written by anyone) and sends code to a language
model. These are in scope:

- **Secret leaks.** A secret in a diff or file that the redaction step does not catch, and that is
  then sent to the model or written to the output.
- **Script injection in the generated HTML.** Any way that text from a pull request, or text the
  model writes, runs as script or loads a remote resource in the explainer page. The page uses a
  strict Content Security Policy, so a bypass of that policy is also in scope.
- **Token exposure.** `GITHUB_TOKEN` or a provider API key that appears in logs, output files, or
  error messages.
- **Command injection** through git ranges, file paths, or PR URLs.

Prompt injection that only changes the _content_ of the explanation (for example, a PR that tells
the model to say it is safe) is a known limitation of all LLM tools. Report it as a normal issue
if you have an idea for a mitigation. It is not a vulnerability unless it leads to one of the
problems above.

## Data handling

lucidiff sends the diff, and for GitHub PRs and git ranges the full contents of changed files,
to the LLM provider you configure. Read the provider's data policy before you use lucidiff on
private code. See the "Privacy" section of the README.
