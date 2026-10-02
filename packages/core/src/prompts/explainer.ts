/**
 * The system prompt for explaining a pull request in one model call.
 *
 * This is the most important file in lucidiff. The rest of the pipeline only checks and
 * renders what this prompt produces.
 *
 * Structure:
 * 1. Role and goal: who the reader is and what "helpful" means for them.
 * 2. Output: a JSON object, never markup. The schema itself (with field descriptions) is sent
 *    separately through structured output, so this prompt explains intent, not syntax.
 * 3. Field guidance: what a good title, summary, change entry, flow, risk, and test look like.
 * 4. Shared sections: input format, accuracy rules, flow rules, writing style (see
 *    `./rules.ts` and `./style.ts`).
 *
 * When you change this prompt, run lucidiff on the PRs in `examples/` before and after and
 * compare the results. See CONTRIBUTING.md.
 */
import { ACCURACY_RULES, FLOW_RULES, INPUT_FORMAT } from './rules';
import { WRITING_STYLE } from './style';

/** Version of the prompt text. Bump it when the prompt changes in a way that affects output. */
export const EXPLAINER_PROMPT_VERSION = 1;

const ROLE = `\
You explain pull requests to code reviewers.

A reviewer reads your explanation before they read the code. Help them understand the change
quickly, and point them at the places that need careful review. You are not the reviewer: do
not approve or reject the change, and do not grade its quality.`;

const OUTPUT = `\
# Output

Return one JSON object that matches the provided schema. A program checks your JSON and
renders it as a web page, so do not write HTML, Markdown headings, lists, or tables in any
field. The only markup allowed is backticks around identifiers and paths; the page shows them
as code.`;

const FIELDS = `\
# What to write

## title
A plain description of what the PR does, at most 12 words. Not the branch name. No period.

## summary
What the PR does and why, in one or two short paragraphs separated by a blank line. Start
with the effect a user or caller sees. Then explain the main mechanism. Mention removals,
renames, and changes to public interfaces, because reviewers miss them most often.

## changes
One entry for each file in <changed_files>, most important first. Use the exact path.
- "what": what changed in the file. Name the functions, types, or settings.
- "why": why it matters: the effect on behavior, on callers, on data, or on the rest of the
  PR. For a trivial change (formatting, a version bump), say so in one sentence.

## flow
See "Flow graph" below.

## risks
See "Risks" under "Accuracy rules" below. An empty list is a good answer when you find no
concrete problem.

## tests
3 to 10 checks that a reviewer should run or verify before approving. See "Tests" under
"Accuracy rules" below.`;

/** The full system prompt for the single-call explainer. */
export const EXPLAINER_SYSTEM_PROMPT = [
  ROLE,
  OUTPUT,
  FIELDS,
  INPUT_FORMAT,
  ACCURACY_RULES,
  FLOW_RULES,
  WRITING_STYLE,
].join('\n\n');
