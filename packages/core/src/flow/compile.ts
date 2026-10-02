/**
 * Compiles a flow graph (nodes and edges written by the model) into Mermaid source.
 *
 * The model never writes Mermaid syntax. It writes a small graph that we validate, and this
 * module turns that graph into a diagram. Because we control every character of the output,
 * labels cannot break the syntax and every diagram gets the same visual language:
 *
 *   entry     ([stadium])     where control enters: a route, command, or event
 *   module    [rectangle]     a file, class, or package
 *   function  (rounded)       a single function or method
 *   data      [(cylinder)]    a database, cache, file, or queue
 *   external  {{hexagon}}     a third-party service or API
 *
 * Changed nodes get the `changed` class and unchanged context nodes get `context`. The
 * renderer styles both classes with CSS, so the diagram follows the page theme.
 */
import type { FlowEdge, FlowGraph, FlowNode, FlowNodeKind } from '../schema/llm';

const SHAPES: Record<FlowNodeKind, [open: string, close: string]> = {
  entry: ['([', '])'],
  module: ['[', ']'],
  function: ['(', ')'],
  data: ['[(', ')]'],
  external: ['{{', '}}'],
};

/** Use top-down layout for larger graphs so the diagram does not get too wide to read. */
const LEFT_TO_RIGHT_MAX_NODES = 5;

/**
 * Escapes text for use inside a double-quoted Mermaid label.
 *
 * Mermaid reads `#name;` sequences as entity codes, so we encode every character that has a
 * syntactic meaning (quotes, brackets, pipes, backticks, `#`, and `;`) as a numeric entity.
 */
export function escapeMermaidLabel(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[#;"'`|<>[\]{}()]/g, (char) => `#${char.codePointAt(0)};`);
}

/** Maps model-supplied ids to ids that are always valid in Mermaid and never keywords. */
function createIdMapper(): (rawId: string) => string {
  const used = new Map<string, string>();
  const taken = new Set<string>();
  return (rawId) => {
    const existing = used.get(rawId);
    if (existing) return existing;
    const base = `n_${rawId.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40) || 'node'}`;
    let id = base;
    for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}_${suffix}`;
    used.set(rawId, id);
    taken.add(id);
    return id;
  };
}

function nodeLine(node: FlowNode, id: string, indent: string): string {
  const [open, close] = SHAPES[node.kind];
  return `${indent}${id}${open}"${escapeMermaidLabel(node.label)}"${close}`;
}

function edgeLine(edge: FlowEdge, mapId: (rawId: string) => string): string {
  const label = edge.label?.trim();
  const arrow = label ? `-->|"${escapeMermaidLabel(label)}"|` : '-->';
  return `  ${mapId(edge.from)} ${arrow} ${mapId(edge.to)}`;
}

/**
 * Groups nodes by file when it helps: at least two files, and at least one file with two
 * or more nodes. Otherwise the subgraph boxes add noise without adding information.
 */
function groupByFile(nodes: FlowNode[]): Map<string, FlowNode[]> | null {
  const groups = new Map<string, FlowNode[]>();
  for (const node of nodes) {
    if (!node.file) continue;
    groups.set(node.file, [...(groups.get(node.file) ?? []), node]);
  }
  const hasSharedFile = [...groups.values()].some((group) => group.length > 1);
  return groups.size >= 2 && hasSharedFile ? groups : null;
}

/**
 * Turns a validated flow graph into Mermaid flowchart source.
 *
 * Call `validateFlowGraph` first: this function assumes every edge points at a known node.
 */
export function compileFlowToMermaid(graph: Pick<FlowGraph, 'nodes' | 'edges'>): string {
  const mapId = createIdMapper();
  const direction = graph.nodes.length > LEFT_TO_RIGHT_MAX_NODES ? 'TD' : 'LR';
  const lines = [`flowchart ${direction}`];

  const groups = groupByFile(graph.nodes);
  const grouped = new Set<FlowNode>();
  if (groups) {
    let index = 0;
    for (const [file, nodes] of groups) {
      if (nodes.length < 2) continue;
      index += 1;
      lines.push(`  subgraph g_${index}["${escapeMermaidLabel(file)}"]`);
      for (const node of nodes) {
        lines.push(nodeLine(node, mapId(node.id), '    '));
        grouped.add(node);
      }
      lines.push('  end');
    }
  }
  for (const node of graph.nodes) {
    if (!grouped.has(node)) lines.push(nodeLine(node, mapId(node.id), '  '));
  }

  for (const edge of graph.edges) lines.push(edgeLine(edge, mapId));

  const changed = graph.nodes.filter((node) => node.changed).map((node) => mapId(node.id));
  const context = graph.nodes.filter((node) => !node.changed).map((node) => mapId(node.id));
  lines.push('  classDef changed stroke-width:2px');
  lines.push('  classDef context stroke-dasharray:4 3');
  if (changed.length > 0) lines.push(`  class ${changed.join(',')} changed`);
  if (context.length > 0) lines.push(`  class ${context.join(',')} context`);

  return lines.join('\n');
}
