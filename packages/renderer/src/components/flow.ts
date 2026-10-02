import type { ExplainerDocument, FlowNodeKind } from '@lucidiff/core/schema';
import { html, type SafeHtml } from '../html';
import { inline } from '../text';

const KIND_LABELS: Record<FlowNodeKind, string> = {
  entry: 'entry point',
  module: 'module',
  function: 'function',
  data: 'data',
  external: 'external service',
};

/**
 * The text version of the flow: a list of components and a list of connections.
 *
 * It is always in the page. When the diagram renders, it stays available (collapsed) as a
 * text alternative. When the diagram cannot render, it opens and takes the diagram's place.
 */
function flowAsText(doc: ExplainerDocument, open: boolean): SafeHtml {
  const { nodes, edges } = doc.flow;
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  return html`<details class="flow-text" data-flow-text ${open ? 'open' : ''}>
    <summary>Components and connections</summary>
    <div class="flow-text-body">
      <div>
        <h3>Components</h3>
        <ul>
          ${nodes.map(
            (node) =>
              html`<li>
                <span class="flow-node-name ${node.changed ? 'is-changed' : ''}"
                  >${node.label}</span
                >
                <span class="muted"
                  >${KIND_LABELS[node.kind]}${node.changed ? ', changed' : ''}</span
                >
                ${node.file ? html`<code>${node.file}</code>` : ''}
              </li>`,
          )}
        </ul>
      </div>
      <div>
        <h3>Connections</h3>
        ${
          edges.length === 0
            ? html`<p class="muted">No connections.</p>`
            : html`<ul>
                ${edges.map(
                  (edge) =>
                    html`<li>
                      ${labels.get(edge.from) ?? edge.from} → ${labels.get(edge.to) ?? edge.to}
                      ${edge.label ? html`<span class="muted">(${edge.label})</span>` : ''}
                    </li>`,
                )}
              </ul>`
        }
      </div>
    </div>
  </details>`;
}

/** The flow diagram, rendered in the browser by Mermaid, with a text fallback. */
export function flowSection(doc: ExplainerDocument): SafeHtml {
  const { flow } = doc;
  const hasNodes = flow.nodes.length > 0;
  const hasDiagram = flow.mermaid !== null && hasNodes;
  return html`<section class="section" id="flow" aria-labelledby="flow-title">
    <h2 id="flow-title">Flow</h2>
    ${
      hasNodes
        ? html`<figure class="flow card">
            ${
              hasDiagram
                ? html`<div
                      class="flow-diagram"
                      data-flow-diagram
                      data-state="loading"
                      role="img"
                      aria-label="${flow.caption || 'Flow diagram'}"
                    >
                      <p class="flow-status muted" data-flow-status>Rendering diagram…</p>
                    </div>
                    <div class="flow-legend" aria-hidden="true">
                      <span class="legend-item"
                        ><span class="swatch swatch-changed"></span>Changed in this PR</span
                      >
                      <span class="legend-item"
                        ><span class="swatch swatch-context"></span>Unchanged context</span
                      >
                    </div>`
                : html`<p class="flow-status muted">
                    The diagram did not pass validation, so it is shown as text.
                  </p>`
            }
            ${flow.caption ? html`<figcaption>${inline(flow.caption)}</figcaption>` : ''}
            ${flowAsText(doc, !hasDiagram)}
          </figure>`
        : html`<p class="empty">No flow diagram is available for this change.</p>`
    }
  </section>`;
}
