import type { PreparedChangeSet } from '../changeset';
import { EXPLAINER_SYSTEM_PROMPT } from '../prompts/explainer';
import { buildUserPrompt } from '../prompts/user-message';
import { ExplanationSchema, type Explanation } from '../schema/llm';
import { approxTokens, callModel, type AnalysisContext } from './context';
import type { ContentSelection } from './plan';

/** Explains the whole PR in one model call. */
export async function analyzeSingle(
  prepared: PreparedChangeSet,
  contents: ContentSelection,
  context: AnalysisContext,
): Promise<Explanation> {
  const prompt = buildUserPrompt({
    source: prepared.source,
    pr: prepared.pr,
    files: prepared.files,
    skipped: prepared.skipped,
    contents,
  });
  return callModel(context, {
    schema: ExplanationSchema,
    schemaName: 'pr_explanation',
    system: EXPLAINER_SYSTEM_PROMPT,
    prompt,
    onProgress: (characters) =>
      context.onProgress(`receiving, ~${approxTokens(characters)} tokens`),
  });
}
