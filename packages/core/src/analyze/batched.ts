/**
 * Map-reduce analysis for PRs that do not fit in one call. See `src/prompts/batched.ts` for
 * the prompts and the reasoning behind the split.
 */
import type { PreparedChangeSet } from '../changeset';
import { BATCH_SYSTEM_PROMPT, buildCombinePrompt, COMBINE_SYSTEM_PROMPT } from '../prompts/batched';
import { buildUserPrompt } from '../prompts/user-message';
import {
  BatchAnalysisSchema,
  OverviewSchema,
  type BatchAnalysis,
  type Explanation,
} from '../schema/llm';
import { callModel, mapWithConcurrency, type AnalysisContext } from './context';
import type { Batch } from './plan';

/** Explains a large PR in batches of files, then combines the batches into one explanation. */
export async function analyzeBatched(
  prepared: PreparedChangeSet,
  batches: readonly Batch[],
  context: AnalysisContext,
): Promise<Explanation> {
  let finished = 0;
  context.onProgress(`batch 0 of ${batches.length}`);

  const results = await mapWithConcurrency(
    batches,
    context.concurrency,
    async (batch): Promise<BatchAnalysis> => {
      const inBatch = new Set(batch.files);
      const prompt = buildUserPrompt({
        source: prepared.source,
        pr: prepared.pr,
        files: batch.files,
        skipped: prepared.skipped,
        contents: batch.contents,
        otherFiles: prepared.files.filter((file) => !inBatch.has(file)),
      });
      const result = await callModel(context, {
        schema: BatchAnalysisSchema,
        schemaName: 'pr_batch_analysis',
        system: BATCH_SYSTEM_PROMPT,
        prompt,
      });
      finished += 1;
      context.onProgress(`batch ${finished} of ${batches.length}`);
      return result;
    },
  );

  const changes = results.flatMap((result) => result.changes);
  const risks = results.flatMap((result) => result.risks);
  const testIdeas = results.flatMap((result) => result.test_ideas);

  context.onProgress('combining batches');
  const overview = await callModel(context, {
    schema: OverviewSchema,
    schemaName: 'pr_overview',
    system: COMBINE_SYSTEM_PROMPT,
    prompt: buildCombinePrompt({
      source: prepared.source,
      pr: prepared.pr,
      files: prepared.files,
      changes,
      notes: results.map((result) => result.notes),
      risks,
      testIdeas,
    }),
  });

  return { ...overview, changes, risks };
}
