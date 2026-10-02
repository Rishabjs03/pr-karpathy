/**
 * Schemas for what the language model writes.
 *
 * These are the contracts we hand to the model through structured output. They are kept
 * deliberately small:
 *
 * - The model only writes what it alone can know: explanations, risks, tests, and the flow.
 *   Facts the diff parser already knows (change kind, line counts, rename source) are added
 *   later by the pipeline, so the model cannot get them wrong.
 * - They use only JSON Schema features that every structured-output provider supports. That
 *   means no tuples, no string length or numeric range limits (so no `.int()`, which adds
 *   safe-integer bounds), and `nullable` instead of optional fields. The pipeline enforces
 *   limits and rounds line numbers after the call. `test/schema.test.ts` checks this.
 *
 * The `.describe()` text is sent to the model as part of the JSON schema, so write it as an
 * instruction.
 */
import { z } from 'zod';

export const SeveritySchema = z.enum(['high', 'medium', 'low']);
export type Severity = z.infer<typeof SeveritySchema>;

export const LineSideSchema = z.enum(['new', 'old']);
export type LineSide = z.infer<typeof LineSideSchema>;

export const FlowNodeKindSchema = z.enum(['entry', 'module', 'function', 'data', 'external']);
export type FlowNodeKind = z.infer<typeof FlowNodeKindSchema>;

export const LlmChangeSchema = z.object({
  file: z
    .string()
    .describe(
      'Path of the changed file exactly as it appears in the diff. Use the new path for renames.',
    ),
  what: z
    .string()
    .describe('What changed in this file. Name the functions, types, or settings that changed.'),
  why: z
    .string()
    .describe('Why the change matters: its effect on behavior, callers, or the rest of the PR.'),
});
export type LlmChange = z.infer<typeof LlmChangeSchema>;

export const LlmRiskSchema = z.object({
  severity: SeveritySchema.describe(
    'high: likely bug, data loss, or security hole. medium: plausible failure under specific conditions. low: minor issue a reviewer should still check.',
  ),
  title: z.string().describe('A short label for the risk, at most 10 words.'),
  file: z
    .string()
    .describe('Path of the file that contains the risky code, exactly as in the diff.'),
  side: LineSideSchema.describe(
    'Which version the line numbers refer to: "new" for the code after the change, "old" for removed code.',
  ),
  start_line: z.number().describe('First line of the risky code, from the numbered diff.'),
  end_line: z.number().describe('Last line of the risky code. Use start_line for one line.'),
  reason: z
    .string()
    .describe('The concrete mechanism: what input or state causes which failure, and why.'),
});
export type LlmRisk = z.infer<typeof LlmRiskSchema>;

export const LlmTestSchema = z.object({
  description: z
    .string()
    .describe('One specific, checkable action for the reviewer. Start with a verb.'),
  related_files: z.array(z.string()).describe('Paths from the diff that this check covers.'),
});
export type LlmTest = z.infer<typeof LlmTestSchema>;

export const FlowNodeSchema = z.object({
  id: z
    .string()
    .describe(
      'Short unique identifier using only letters, digits, and underscores, e.g. "parse_config".',
    ),
  label: z
    .string()
    .describe('Display name: the function, module, or resource name. At most 6 words.'),
  kind: FlowNodeKindSchema.describe(
    'entry: where control enters (route, CLI command, event). module: file or class. function: single function. data: store, cache, file, or queue. external: third-party service or API.',
  ),
  file: z.string().nullable().describe('Path from the diff that defines this node, or null.'),
  changed: z.boolean().describe('True if this PR changes the node; false for unchanged context.'),
});
export type FlowNode = z.infer<typeof FlowNodeSchema>;

export const FlowEdgeSchema = z.object({
  from: z.string().describe('id of the source node.'),
  to: z.string().describe('id of the target node.'),
  label: z
    .string()
    .nullable()
    .describe('What passes along this edge (a call, a value, an event), at most 5 words, or null.'),
});
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;

export const FlowGraphSchema = z.object({
  caption: z.string().describe('One or two sentences that explain what the diagram shows.'),
  nodes: z.array(FlowNodeSchema).describe('Between 2 and 12 nodes. Prefer fewer, clearer nodes.'),
  edges: z.array(FlowEdgeSchema).describe('Directed edges for calls, data flow, or events.'),
});
export type FlowGraph = z.infer<typeof FlowGraphSchema>;

/** The complete explanation for a PR, produced in one model call. */
export const ExplanationSchema = z.object({
  title: z.string().describe('A plain title for the PR, at most 12 words.'),
  summary: z
    .string()
    .describe(
      'What the PR does and why, in one or two short paragraphs separated by a blank line.',
    ),
  changes: z.array(LlmChangeSchema).describe('One entry per changed file, most important first.'),
  flow: FlowGraphSchema.describe('How the changed parts connect and how control or data flows.'),
  risks: z
    .array(LlmRiskSchema)
    .describe('Concrete risks only. An empty array is a valid and good answer.'),
  tests: z
    .array(LlmTestSchema)
    .describe('Between 3 and 10 checks a reviewer should run or verify.'),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

/** Output of one map step when a large PR is analyzed in batches of files. */
export const BatchAnalysisSchema = z.object({
  changes: z.array(LlmChangeSchema).describe('One entry per file in this batch.'),
  risks: z
    .array(LlmRiskSchema)
    .describe('Concrete risks in this batch only. An empty array is a valid and good answer.'),
  test_ideas: z.array(LlmTestSchema).describe('Checks a reviewer should run for this batch.'),
  notes: z
    .string()
    .describe(
      'Facts the final summary needs: which functions call which, what data moves where, and links to files outside this batch. At most 120 words.',
    ),
});
export type BatchAnalysis = z.infer<typeof BatchAnalysisSchema>;

/** Output of the combining step for a large PR. */
export const OverviewSchema = z.object({
  title: ExplanationSchema.shape.title,
  summary: ExplanationSchema.shape.summary,
  flow: ExplanationSchema.shape.flow,
  tests: ExplanationSchema.shape.tests,
});
export type Overview = z.infer<typeof OverviewSchema>;
