/**
 * The explainer pipeline:
 *
 *   load → filter → fetch contents → redact → plan → analyze (LLM) → validate → document
 *
 * `explain()` is the main entry point of the library. It returns a validated explainer
 * document; render it with `renderHtml()` from `@lucidiff/renderer`.
 */
import type { LanguageModel } from 'ai';
import packageJson from '../package.json' with { type: 'json' };
import { analyzeBatched } from './analyze/batched';
import { UsageTracker, type AnalysisContext } from './analyze/context';
import { DEFAULT_BUDGET, planAnalysis, type BudgetOptions } from './analyze/plan';
import { analyzeSingle } from './analyze/single';
import type { PreparedChangeSet } from './changeset';
import { estimateTokens } from './diff/format';
import { UserError } from './errors';
import { resolveFlow } from './flow/resolve';
import { generateStructured } from './llm/generate';
import { createModel, effortProviderOptions, type Effort, type ModelChoice } from './llm/provider';
import {
  validateRiskCitations,
  type CitationOptions,
  type DroppedRisk,
} from './postprocess/citations';
import { mergeChanges } from './postprocess/changes';
import { FileIndex } from './postprocess/paths';
import { cleanTests } from './postprocess/tests';
import { clampText } from './postprocess/text';
import { filterFiles, redactChangeSet, type FilterOptions } from './prepare';
import { BATCH_SYSTEM_PROMPT } from './prompts/batched';
import { EXPLAINER_SYSTEM_PROMPT } from './prompts/explainer';
import {
  ExplainerDocumentSchema,
  SCHEMA_VERSION,
  type DocumentRisk,
  type ExplainerDocument,
} from './schema/document';
import { FlowGraphSchema, type Severity } from './schema/llm';
import { loadSource, type ExplainInput, type SourceOptions } from './sources';

export const TOOL_NAME = 'lucidiff';
export const TOOL_VERSION: string = packageJson.version;

export type PipelineStage = 'load' | 'prepare' | 'analyze' | 'validate';

export interface ProgressEvent {
  stage: PipelineStage;
  type: 'start' | 'update' | 'end';
  message: string;
}

export interface ExplainOptions extends SourceOptions, FilterOptions {
  /**
   * The model to use: an AI SDK `LanguageModel` (any provider), or a gateway model id string.
   * When omitted, lucidiff creates one from `provider`, `modelId`, and `env`.
   */
  model?: LanguageModel;
  /** Provider name: "anthropic", "openai", or "gateway". */
  provider?: string;
  /** Model id, for example "claude-opus-5-5". */
  modelId?: string;
  /** Environment for API keys and defaults. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Reasoning effort for providers that support it. Defaults to the provider's default. */
  effort?: Effort;
  /** Redact likely secrets before sending anything to the model. Default true. */
  redact?: boolean;
  /** Send full file contents for context (GitHub and git sources). Default true. */
  context?: boolean;
  /** Token budget. Defaults to `DEFAULT_BUDGET`. */
  budget?: Partial<Omit<BudgetOptions, 'includeContents'>>;
  /** Risk citation checks. */
  citations?: CitationOptions;
  /** Concurrent model calls for large PRs. Default 3. */
  concurrency?: number;
  abortSignal?: AbortSignal;
  /** Receives progress for each stage (for spinners). */
  onProgress?: (event: ProgressEvent) => void;
  /** Receives debug details, including raw model responses. Never receives API keys. */
  onDebug?: (message: string) => void;
  /** Clock, for tests. */
  now?: () => Date;
}

export interface ExplainResult {
  document: ExplainerDocument;
  /** Risks removed by citation validation, with the reason for each. */
  droppedRisks: DroppedRisk[];
  /** Non-fatal problems worth showing the user, such as a flow diagram that fell back to text. */
  warnings: string[];
  /** Redaction counts by kind, for --verbose output. */
  redactionsByKind: Record<string, number>;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function resolveModelChoice(options: ExplainOptions): ModelChoice {
  if (options.model !== undefined) {
    if (typeof options.model === 'string') {
      return { provider: 'gateway', modelId: options.model, model: options.model };
    }
    const model = options.model as { provider?: string; modelId?: string };
    return {
      provider: (options.provider ?? model.provider ?? 'custom') as ModelChoice['provider'],
      modelId: options.modelId ?? model.modelId ?? 'unknown',
      model: options.model,
    };
  }
  return createModel({
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.modelId ? { model: options.modelId } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
}

function sortRisks(risks: DocumentRisk[]): DocumentRisk[] {
  return risks
    .map((risk, index) => ({ risk, index }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.risk.severity] - SEVERITY_ORDER[b.risk.severity] || a.index - b.index,
    )
    .map(({ risk }) => risk);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Explains a pull request or diff.
 *
 * @example
 *   import { explain } from '@lucidiff/core';
 *   const { document } = await explain({ kind: 'github', url: 'https://github.com/o/r/pull/1' });
 *
 * @throws {UserError} for problems the caller can fix: a missing API key, an invalid URL, an
 *   empty diff, or a diff where every file is skipped.
 */
export async function explain(
  input: ExplainInput,
  options: ExplainOptions = {},
): Promise<ExplainResult> {
  const emit = options.onProgress ?? (() => {});
  const debug = options.onDebug ?? (() => {});
  const now = options.now ?? (() => new Date());
  const warnings: string[] = [];

  // Resolve the model first, so a missing API key fails before any network call.
  const choice = resolveModelChoice(options);

  // 1. Load
  emit({ stage: 'load', type: 'start', message: 'Loading changes' });
  const loaded = await loadSource(input, options);
  const { changeSet } = loaded;
  emit({
    stage: 'load',
    type: 'end',
    message: `${changeSet.source.label}: ${plural(changeSet.files.length + changeSet.skipped.length, 'file')}`,
  });

  // 2. Filter, fetch contents, redact
  emit({ stage: 'prepare', type: 'start', message: 'Filtering and redacting' });
  const filtered = filterFiles(changeSet.files, options);
  const skipped = [...changeSet.skipped, ...filtered.skipped];
  if (filtered.files.length === 0) {
    throw new UserError(
      `All ${plural(skipped.length, 'changed file')} were skipped (lockfiles, binaries, or generated files). ` +
        'Use --include <glob> to analyze specific files anyway.',
    );
  }
  let contents = changeSet.contents;
  if (options.context !== false && loaded.fetchContents) {
    emit({ stage: 'prepare', type: 'update', message: 'fetching full file contents' });
    contents = await loaded.fetchContents(filtered.files);
  }
  const prepared: PreparedChangeSet = redactChangeSet(
    { ...changeSet, files: filtered.files, contents, skipped },
    options.redact !== false,
  );
  for (const [kind, count] of Object.entries(prepared.redactionsByKind)) {
    debug(`Redacted ${count} × ${kind}`);
  }
  emit({
    stage: 'prepare',
    type: 'end',
    message: `${plural(prepared.files.length, 'file')} to analyze, ${skipped.length} skipped, ${plural(prepared.redactions, 'secret')} redacted`,
  });

  // 3. Plan and analyze
  const budget: BudgetOptions = {
    ...DEFAULT_BUDGET,
    ...options.budget,
    includeContents: options.context !== false,
  };
  const plan = planAnalysis(
    prepared,
    estimateTokens(EXPLAINER_SYSTEM_PROMPT),
    estimateTokens(BATCH_SYSTEM_PROMPT),
    budget,
  );
  if (plan.mode === 'batched' && plan.batches.length === 0) {
    throw new UserError(
      'Every file diff is larger than the batch token budget. Raise the budget or use --ignore to skip large files.',
    );
  }
  if (plan.tooLarge.length > 0) {
    const large = new Set(plan.tooLarge.map((file) => file.path));
    prepared.files = prepared.files.filter((file) => !large.has(file.path));
    prepared.skipped.push(
      ...plan.tooLarge.map((file) => ({ file: file.path, reason: 'too-large' as const })),
    );
    warnings.push(
      `Skipped ${plural(plan.tooLarge.length, 'file')} whose diff alone exceeds the batch budget.`,
    );
  }
  debug(
    `Plan: ${plan.mode}${plan.mode === 'batched' ? ` (${plan.batches.length} batches)` : ''}, ~${plan.estimatedTokens} input tokens`,
  );

  const usage = new UsageTracker();
  const providerOptions = effortProviderOptions(options.effort);
  const context: AnalysisContext = {
    model: choice.model,
    ...(providerOptions ? { providerOptions } : {}),
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
    concurrency: options.concurrency ?? 3,
    usage,
    onDebug: debug,
    onProgress: (message) => emit({ stage: 'analyze', type: 'update', message }),
  };
  emit({
    stage: 'analyze',
    type: 'start',
    message: `Analyzing with ${choice.modelId}${plan.mode === 'batched' ? ` in ${plan.batches.length} batches` : ''}`,
  });
  const draft =
    plan.mode === 'single'
      ? await analyzeSingle(prepared, plan.contents, context)
      : await analyzeBatched(prepared, plan.batches, context);
  emit({ stage: 'analyze', type: 'end', message: plural(usage.calls, 'model call') });

  // 4. Validate and assemble
  emit({ stage: 'validate', type: 'start', message: 'Validating citations and diagram' });
  const index = new FileIndex(prepared.files);
  const changes = mergeChanges(draft.changes, index);
  if (changes.unknownFiles.length > 0) {
    debug(`Ignored explanations for files not in the diff: ${changes.unknownFiles.join(', ')}`);
  }
  const citations = validateRiskCitations(draft.risks, index, options.citations);
  for (const { risk, reason } of citations.dropped)
    debug(`Dropped risk "${risk.title}": ${reason}`);

  const flow = await resolveFlow(draft.flow, index.paths, async (system, prompt) => {
    emit({ stage: 'validate', type: 'update', message: 'repairing the flow graph' });
    const result = await generateStructured({
      model: choice.model,
      schema: FlowGraphSchema,
      schemaName: 'flow_graph',
      system,
      prompt,
      maxOutputTokens: 8000,
      ...(providerOptions ? { providerOptions } : {}),
      ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
      onDebug: debug,
    });
    usage.add(result.usage, result.calls);
    return result.output;
  });
  if (flow.errors.length > 0) {
    warnings.push('The flow diagram failed validation and is shown as a text list.');
    for (const error of flow.errors) debug(`Flow: ${error}`);
  }

  const totalChanged = prepared.files.length + prepared.skipped.length;
  const all = [...changeSet.files];
  const document: ExplainerDocument = {
    schema_version: SCHEMA_VERSION,
    title: clampText(draft.title, 200) || prepared.pr?.title || 'Untitled change',
    summary: clampText(draft.summary, 5000),
    changes: changes.changes,
    flow: flow.flow,
    risks: sortRisks(citations.risks),
    tests: cleanTests(draft.tests, index),
    skipped_files: prepared.skipped,
    meta: {
      tool: { name: TOOL_NAME, version: TOOL_VERSION },
      model: choice.modelId,
      provider: choice.provider,
      generated_at: now().toISOString(),
      pr_url: prepared.pr?.url ?? null,
      source: prepared.source,
      mode: plan.mode,
      stats: {
        files_changed: totalChanged,
        files_analyzed: prepared.files.length,
        additions: all.reduce((sum, file) => sum + file.additions, 0),
        deletions: all.reduce((sum, file) => sum + file.deletions, 0),
      },
      usage: {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        total_tokens: usage.inputTokens + usage.outputTokens,
        llm_calls: usage.calls,
      },
      redactions: prepared.redactions,
      dropped_risks: citations.dropped.length,
    },
  };
  // A final check: the renderer and --json consumers can rely on this shape.
  const validated = ExplainerDocumentSchema.parse(document);
  emit({
    stage: 'validate',
    type: 'end',
    message: `${plural(validated.risks.length, 'risk')}${citations.dropped.length ? ` (${citations.dropped.length} dropped)` : ''}, ${plural(validated.tests.length, 'check')}`,
  });

  return {
    document: validated,
    droppedRisks: citations.dropped,
    warnings,
    redactionsByKind: prepared.redactionsByKind,
  };
}
