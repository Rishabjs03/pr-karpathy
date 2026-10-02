/**
 * The explainer document: the final, validated JSON that the renderer turns into HTML.
 *
 * It combines what the model wrote (see `./llm.ts`) with facts from the diff and metadata
 * from the pipeline. `--json` prints this document, and `lucidiff render` reads it back, so
 * treat it as a public, versioned format: bump `SCHEMA_VERSION` on breaking changes.
 */
import { z } from 'zod';
import { FlowEdgeSchema, FlowNodeSchema, LineSideSchema, SeveritySchema } from './llm';

export const SCHEMA_VERSION = 1;

export const ChangeKindSchema = z.enum(['added', 'modified', 'deleted', 'renamed']);
export type ChangeKind = z.infer<typeof ChangeKindSchema>;

const httpUrl = z.url({ protocol: /^https?$/ });

export const DocumentChangeSchema = z.object({
  file: z.string().min(1),
  /** Previous path, set only for renames. */
  old_file: z.string().nullable(),
  kind: ChangeKindSchema,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  /** Null when the model did not describe this file. */
  what: z.string().nullable(),
  why: z.string().nullable(),
});
export type DocumentChange = z.infer<typeof DocumentChangeSchema>;

export const DocumentFlowSchema = z.object({
  caption: z.string(),
  nodes: z.array(FlowNodeSchema),
  edges: z.array(FlowEdgeSchema),
  /**
   * Mermaid source compiled from `nodes` and `edges`. Null when the graph failed validation;
   * the renderer then shows a plain list of components and connections instead.
   */
  mermaid: z.string().nullable(),
});
export type DocumentFlow = z.infer<typeof DocumentFlowSchema>;

export const DocumentRiskSchema = z.object({
  /** Stable identifier derived from the risk content. */
  id: z.string().min(1),
  severity: SeveritySchema,
  title: z.string(),
  file: z.string().min(1),
  side: LineSideSchema,
  lines: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  reason: z.string(),
});
export type DocumentRisk = z.infer<typeof DocumentRiskSchema>;

export const DocumentTestSchema = z.object({
  /** Stable identifier derived from the description, used to persist checkbox state. */
  id: z.string().min(1),
  description: z.string().min(1),
  related_files: z.array(z.string()),
});
export type DocumentTest = z.infer<typeof DocumentTestSchema>;

export const SkipReasonSchema = z.enum(['ignored', 'binary', 'generated', 'too-large']);
export type SkipReason = z.infer<typeof SkipReasonSchema>;

export const SkippedFileSchema = z.object({
  file: z.string(),
  reason: SkipReasonSchema,
});
export type SkippedFile = z.infer<typeof SkippedFileSchema>;

export const SourceSchema = z.object({
  kind: z.enum(['github', 'git', 'diff']),
  /** Human-readable origin, e.g. "acme/api#42", "main...feature", or "stdin". */
  label: z.string(),
  repository: z.string().nullable(),
  base_ref: z.string().nullable(),
  head_ref: z.string().nullable(),
  author: z.string().nullable(),
});
export type Source = z.infer<typeof SourceSchema>;

export const UsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  llm_calls: z.number().int().nonnegative(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const MetaSchema = z.object({
  tool: z.object({ name: z.string(), version: z.string() }),
  model: z.string(),
  provider: z.string(),
  generated_at: z.iso.datetime({ offset: true }),
  pr_url: httpUrl.nullable(),
  source: SourceSchema,
  /** "single" for one model call, "batched" when a large PR was split (map-reduce). */
  mode: z.enum(['single', 'batched']),
  stats: z.object({
    files_changed: z.number().int().nonnegative(),
    files_analyzed: z.number().int().nonnegative(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
  }),
  usage: UsageSchema,
  /** Number of likely secrets replaced before any text was sent to the model. */
  redactions: z.number().int().nonnegative(),
  /** Number of model-reported risks removed because their file or line citation was invalid. */
  dropped_risks: z.number().int().nonnegative(),
});
export type Meta = z.infer<typeof MetaSchema>;

export const ExplainerDocumentSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  title: z.string(),
  summary: z.string(),
  changes: z.array(DocumentChangeSchema),
  flow: DocumentFlowSchema,
  risks: z.array(DocumentRiskSchema),
  tests: z.array(DocumentTestSchema),
  skipped_files: z.array(SkippedFileSchema),
  meta: MetaSchema,
});
export type ExplainerDocument = z.infer<typeof ExplainerDocumentSchema>;

/**
 * Validates unknown input (for example a JSON file) as an explainer document.
 *
 * @throws {z.ZodError} when the input does not match the schema.
 */
export function parseExplainerDocument(input: unknown): ExplainerDocument {
  return ExplainerDocumentSchema.parse(input);
}
