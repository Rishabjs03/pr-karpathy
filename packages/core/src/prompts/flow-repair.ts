/**
 * The prompt for the one repair attempt when a flow graph fails validation.
 *
 * The repair call is small and focused: it gets the broken graph, the exact problems, and the
 * list of files, and returns only a corrected graph. That is cheaper and more reliable than
 * asking for the whole explanation again.
 */
import type { FlowGraph } from '../schema/llm';
import { FLOW_RULES } from './rules';
import { WRITING_STYLE } from './style';

export const FLOW_REPAIR_SYSTEM_PROMPT = `\
You fix a flow graph that failed validation. The graph explains how the parts of a pull
request connect. Return one JSON object that matches the provided schema.

Fix every listed problem. Keep the meaning of the original graph: keep its nodes, labels, and
edges where they are valid, and change only what you must.

${FLOW_RULES}

${WRITING_STYLE}`;

/** Builds the user message for a flow repair call. */
export function buildFlowRepairPrompt(
  graph: FlowGraph,
  errors: readonly string[],
  files: readonly string[],
): string {
  return [
    '<problems>',
    ...errors.map((error) => `- ${error}`),
    '</problems>',
    '',
    '<changed_files>',
    ...files.map((file) => `- ${file}`),
    '</changed_files>',
    '',
    '<graph>',
    JSON.stringify(graph, null, 2),
    '</graph>',
  ].join('\n');
}
