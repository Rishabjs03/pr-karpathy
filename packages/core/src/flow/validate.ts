/**
 * Validation for the flow graph the model writes.
 *
 * `validateFlowGraph` checks the structure (unique ids, edges that point at real nodes, a
 * sane size). `checkMermaidSyntax` additionally runs Mermaid's own parser on the compiled
 * source when the optional `mermaid` package is installed. Errors from both are plain
 * sentences, because the pipeline sends them back to the model for one repair attempt.
 */
import type { FlowGraph } from '../schema/llm';

/** Hard limit. The prompt asks for at most 12 nodes; we accept some slack. */
export const MAX_FLOW_NODES = 20;

export interface FlowValidationResult {
  /** The graph with harmless problems fixed (unknown files cleared, empty labels nulled). */
  graph: FlowGraph;
  /** Problems that make the graph unusable. Empty means the graph is valid. */
  errors: string[];
}

/**
 * Checks a flow graph for structural problems and fixes the harmless ones.
 *
 * @param graph - The graph as the model wrote it.
 * @param knownFiles - Paths that exist in the diff. Node files outside this set become null.
 */
export function validateFlowGraph(
  graph: FlowGraph,
  knownFiles: ReadonlySet<string>,
): FlowValidationResult {
  const errors: string[] = [];

  const nodes = graph.nodes.map((node) => ({
    ...node,
    id: node.id.trim(),
    label: node.label.trim() || node.id.trim(),
    file: node.file && knownFiles.has(node.file) ? node.file : null,
  }));
  const edges = graph.edges.map((edge) => ({
    from: edge.from.trim(),
    to: edge.to.trim(),
    label: edge.label?.trim() ? edge.label.trim() : null,
  }));

  if (nodes.length === 0) errors.push('The flow has no nodes. Add at least two nodes.');
  if (nodes.length > MAX_FLOW_NODES) {
    errors.push(
      `The flow has ${nodes.length} nodes. Use at most 12 nodes; merge minor ones into their module.`,
    );
  }

  const ids = new Set<string>();
  const duplicates = new Set<string>();
  for (const node of nodes) {
    if (!node.id) errors.push(`A node with label "${node.label}" has an empty id.`);
    else if (ids.has(node.id)) duplicates.add(node.id);
    ids.add(node.id);
  }
  if (duplicates.size > 0) {
    errors.push(`These node ids appear more than once: ${[...duplicates].join(', ')}.`);
  }

  const dangling = edges.filter((edge) => !ids.has(edge.from) || !ids.has(edge.to));
  if (dangling.length > 0) {
    const list = dangling.map((edge) => `${edge.from} -> ${edge.to}`).join(', ');
    errors.push(`These edges point at node ids that do not exist: ${list}.`);
  }

  return { graph: { caption: graph.caption.trim(), nodes, edges }, errors };
}

export type MermaidSyntaxResult =
  { status: 'valid' } | { status: 'invalid'; error: string } | { status: 'unavailable' };

interface MermaidParser {
  parse(text: string): Promise<unknown>;
}

let mermaidParser: Promise<MermaidParser | null> | undefined;

async function loadMermaid(): Promise<MermaidParser | null> {
  // A variable specifier keeps bundlers from inlining the (large, optional) package.
  const specifier = 'mermaid';
  try {
    const mod = (await import(specifier)) as { default: MermaidParser };
    return mod.default;
  } catch {
    return null;
  }
}

/** True for errors that come from Mermaid's grammar, as opposed to its rendering setup. */
function isSyntaxError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('hash' in error) return true;
  const message = 'message' in error ? String(error.message) : '';
  const name = 'name' in error ? String(error.name) : '';
  return (
    /^(Parse|Lexical) error/.test(message) ||
    /No diagram type detected/.test(message) ||
    name === 'UnknownDiagramError'
  );
}

/**
 * Runs Mermaid's parser on the source, if the optional `mermaid` package is installed.
 *
 * Mermaid's parser runs in Node, but a later sanitizing step needs a browser DOM and throws.
 * We treat only grammar errors as invalid. Anything else means the parse step succeeded, and
 * the page still shows a plain fallback if the browser cannot render the diagram.
 */
export async function checkMermaidSyntax(source: string): Promise<MermaidSyntaxResult> {
  mermaidParser ??= loadMermaid();
  const parser = await mermaidParser;
  if (!parser) return { status: 'unavailable' };
  try {
    await parser.parse(source);
    return { status: 'valid' };
  } catch (error) {
    if (!isSyntaxError(error)) return { status: 'valid' };
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'invalid', error: message.split('\n').slice(0, 4).join('\n') };
  }
}
