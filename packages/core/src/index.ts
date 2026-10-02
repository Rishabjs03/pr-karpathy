/**
 * @lucidiff/core turns a pull request or diff into a validated, structured explanation.
 *
 * @example
 *   import { explain } from '@lucidiff/core';
 *   import { renderHtml } from '@lucidiff/renderer';
 *
 *   const { document } = await explain({ kind: 'github', url: 'https://github.com/o/r/pull/1' });
 *   const html = renderHtml(document);
 */
export {
  explain,
  TOOL_NAME,
  TOOL_VERSION,
  type ExplainOptions,
  type ExplainResult,
  type PipelineStage,
  type ProgressEvent,
} from './pipeline';
export { UserError } from './errors';
export type { ChangeSet, FileContents, PreparedChangeSet, PullRequestInfo } from './changeset';
export * from './schema';
export * from './flow';
export * from './diff';
export * from './sources';
export {
  createModel,
  DEFAULT_MODELS,
  effortProviderOptions,
  PROVIDER_KEY_VARIABLES,
  PROVIDERS,
  resolveProvider,
  type CreateModelOptions,
  type Effort,
  type ModelChoice,
  type ProviderName,
} from './llm/provider';
export {
  generateStructured,
  type StructuredCallOptions,
  type StructuredCallResult,
} from './llm/generate';
export {
  DEFAULT_IGNORE_PATTERNS,
  filterFiles,
  redactChangeSet,
  redactText,
  createRedactionCounter,
} from './prepare';
export {
  validateRiskCitations,
  type CitationOptions,
  type DroppedRisk,
} from './postprocess/citations';
export {
  DEFAULT_BUDGET,
  planAnalysis,
  splitFileByHunks,
  type AnalysisPlan,
  type BudgetOptions,
} from './analyze/plan';
export * as prompts from './prompts';
