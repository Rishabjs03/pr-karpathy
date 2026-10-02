/**
 * Turns the model's flow graph into the document's flow: validate, repair once, compile.
 *
 * 1. Validate the graph's structure, compile it to Mermaid, and run Mermaid's parser on the
 *    result when the optional `mermaid` package is installed.
 * 2. On any problem, ask the model once to fix the graph, with the exact errors.
 * 3. If the repaired graph still fails, keep the nodes and edges but set `mermaid` to null.
 *    The page then shows a plain list of components and connections instead of a broken
 *    diagram.
 */
import { FLOW_REPAIR_SYSTEM_PROMPT, buildFlowRepairPrompt } from '../prompts/flow-repair';
import type { DocumentFlow } from '../schema/document';
import { FlowGraphSchema, type FlowGraph } from '../schema/llm';
import { compileFlowToMermaid } from './compile';
import { checkMermaidSyntax, validateFlowGraph } from './validate';

export interface FlowResolution {
  flow: DocumentFlow;
  /** True when the repair call ran. */
  repaired: boolean;
  /** Errors left after the repair attempt. Empty when the diagram is valid. */
  errors: string[];
}

/** Calls the model to repair a graph. Provided by the pipeline. */
export type FlowRepairer = (system: string, prompt: string) => Promise<FlowGraph>;

async function check(graph: FlowGraph, knownFiles: ReadonlySet<string>) {
  const { graph: cleaned, errors } = validateFlowGraph(graph, knownFiles);
  if (errors.length > 0) return { graph: cleaned, errors, mermaid: null };
  const mermaid = compileFlowToMermaid(cleaned);
  const syntax = await checkMermaidSyntax(mermaid);
  if (syntax.status === 'invalid') {
    return {
      graph: cleaned,
      errors: [
        `The diagram compiled from this graph does not parse: ${syntax.error}. Use simpler labels.`,
      ],
      mermaid: null,
    };
  }
  return { graph: cleaned, errors: [], mermaid };
}

/**
 * Validates and compiles a flow graph, with one repair attempt.
 *
 * @param graph - The graph the model wrote.
 * @param knownFiles - Paths in the diff, for validating node files.
 * @param repair - Calls the model to fix the graph, or null to skip the repair attempt.
 */
export async function resolveFlow(
  graph: FlowGraph,
  knownFiles: ReadonlySet<string>,
  repair: FlowRepairer | null,
): Promise<FlowResolution> {
  const first = await check(graph, knownFiles);
  if (first.errors.length === 0 || !repair) {
    return {
      flow: { ...first.graph, mermaid: first.mermaid },
      repaired: false,
      errors: first.errors,
    };
  }

  let repairedGraph: FlowGraph;
  try {
    repairedGraph = FlowGraphSchema.parse(
      await repair(
        FLOW_REPAIR_SYSTEM_PROMPT,
        buildFlowRepairPrompt(first.graph, first.errors, [...knownFiles]),
      ),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      flow: { ...first.graph, mermaid: null },
      repaired: true,
      errors: [...first.errors, `The repair call failed: ${reason}`],
    };
  }

  const second = await check(repairedGraph, knownFiles);
  // If the repair made things worse (no nodes at all), keep the original nodes for the text view.
  const graphForText = second.graph.nodes.length > 0 ? second.graph : first.graph;
  return {
    flow: { ...graphForText, mermaid: second.mermaid },
    repaired: true,
    errors: second.errors,
  };
}
