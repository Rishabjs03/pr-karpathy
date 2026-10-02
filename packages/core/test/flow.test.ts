import { describe, expect, it } from 'vitest';
import {
  checkMermaidSyntax,
  compileFlowToMermaid,
  escapeMermaidLabel,
  validateFlowGraph,
} from '../src/flow';
import type { FlowGraph, FlowNode } from '../src/schema';

const node = (id: string, overrides: Partial<FlowNode> = {}): FlowNode => ({
  id,
  label: id,
  kind: 'function',
  file: null,
  changed: true,
  ...overrides,
});

const graph = (nodes: FlowNode[], edges: FlowGraph['edges'] = []): FlowGraph => ({
  caption: 'A caption.',
  nodes,
  edges,
});

describe('validateFlowGraph', () => {
  const files = new Set(['src/a.ts']);

  it('accepts a well-formed graph', () => {
    const result = validateFlowGraph(
      graph([node('a'), node('b')], [{ from: 'a', to: 'b', label: null }]),
      files,
    );
    expect(result.errors).toEqual([]);
  });

  it('reports an empty graph', () => {
    expect(validateFlowGraph(graph([]), files).errors[0]).toMatch(/no nodes/);
  });

  it('reports duplicate ids', () => {
    const result = validateFlowGraph(graph([node('a'), node('a')]), files);
    expect(result.errors.join(' ')).toMatch(/more than once: a/);
  });

  it('reports edges that point at missing nodes', () => {
    const result = validateFlowGraph(
      graph([node('a')], [{ from: 'a', to: 'ghost', label: null }]),
      files,
    );
    expect(result.errors.join(' ')).toMatch(/a -> ghost/);
  });

  it('reports graphs that are too large', () => {
    const nodes = Array.from({ length: 25 }, (_, i) => node(`n${i}`));
    expect(validateFlowGraph(graph(nodes), files).errors.join(' ')).toMatch(/25 nodes/);
  });

  it('clears files that are not in the diff and blank edge labels', () => {
    const result = validateFlowGraph(
      graph(
        [node('a', { file: 'src/a.ts' }), node('b', { file: 'src/invented.ts' })],
        [{ from: 'a', to: 'b', label: '  ' }],
      ),
      files,
    );
    expect(result.graph.nodes.map((n) => n.file)).toEqual(['src/a.ts', null]);
    expect(result.graph.edges[0]?.label).toBeNull();
  });
});

describe('compileFlowToMermaid', () => {
  it('maps node kinds to shapes and marks changed nodes', () => {
    const source = compileFlowToMermaid(
      graph(
        [
          node('route', { kind: 'entry', changed: false }),
          node('db', { kind: 'data' }),
          node('api', { kind: 'external', changed: false }),
        ],
        [{ from: 'route', to: 'db', label: 'writes' }],
      ),
    );
    expect(source).toContain('flowchart LR');
    expect(source).toContain('n_route(["route"])');
    expect(source).toContain('n_db[("db")]');
    expect(source).toContain('n_api{{"api"}}');
    expect(source).toContain('n_route -->|"writes"| n_db');
    expect(source).toContain('class n_db changed');
    expect(source).toContain('class n_route,n_api context');
  });

  it('prefixes ids so Mermaid keywords cannot break the diagram', () => {
    const source = compileFlowToMermaid(
      graph([node('end'), node('graph')], [{ from: 'end', to: 'graph', label: null }]),
    );
    expect(source).toContain('n_end --> n_graph');
  });

  it('keeps ids unique after sanitizing', () => {
    const source = compileFlowToMermaid(graph([node('a-b'), node('a_b')]));
    expect(source).toContain('n_a_b(');
    expect(source).toContain('n_a_b_2(');
  });

  it('groups nodes by file when several nodes share a file', () => {
    const source = compileFlowToMermaid(
      graph([
        node('a', { file: 'src/x.ts' }),
        node('b', { file: 'src/x.ts' }),
        node('c', { file: 'src/y.ts' }),
      ]),
    );
    expect(source).toContain('subgraph g_1["src/x.ts"]');
    expect(source.match(/subgraph/g)).toHaveLength(1);
  });

  it('switches to top-down layout for larger graphs', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => node(`n${i}`));
    expect(compileFlowToMermaid(graph(nodes))).toMatch(/^flowchart TD/);
  });

  it('encodes characters that have meaning in Mermaid', () => {
    expect(escapeMermaidLabel('a "b" [c] | `d` #e;')).toBe(
      'a #34;b#34; #91;c#93; #124; #96;d#96; #35;e#59;',
    );
  });

  it('always produces source that Mermaid parses, even for hostile labels', async () => {
    const labels = [
      '"quoted" (x) [y] {z}',
      '<b>|pipe|</b>',
      '`tick` #hash;',
      'end',
      '%%comment',
      '-->',
      'A;B',
      'click',
      'émoji 🚀',
    ];
    const nodes = labels.map((label, i) =>
      node(`n${i}`, {
        label,
        kind: (['entry', 'module', 'function', 'data', 'external'] as const)[i % 5],
      }),
    );
    const edges = nodes
      .slice(1)
      .map((n, i) => ({ from: nodes[i]!.id, to: n.id, label: labels[(i + 2) % labels.length]! }));
    const result = await checkMermaidSyntax(compileFlowToMermaid(graph(nodes, edges)));
    expect(result.status).toBe('valid');
  });
});

describe('checkMermaidSyntax', () => {
  it('reports grammar errors', async () => {
    const result = await checkMermaidSyntax('flowchart LR\n  a["unclosed --> b');
    expect(result.status).toBe('invalid');
  });

  it('accepts valid source', async () => {
    expect((await checkMermaidSyntax('flowchart LR\n  a --> b')).status).toBe('valid');
  });
});
