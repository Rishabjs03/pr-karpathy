import type { DocumentRisk, ExplainerDocument, Severity } from '@lucidiff/core/schema';
import { html, type SafeHtml } from '../html';
import { icons } from '../icons';
import { prLineUrl } from '../links';
import { formatLines, inline } from '../text';

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_LABELS: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** Sorts risks high → low, keeping the model's order within a severity. */
export function sortRisks(risks: readonly DocumentRisk[]): DocumentRisk[] {
  return risks
    .map((risk, index) => ({ risk, index }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.risk.severity] - SEVERITY_ORDER[b.risk.severity] || a.index - b.index,
    )
    .map(({ risk }) => risk);
}

function location(risk: DocumentRisk, prUrl: string | null): SafeHtml {
  const text = `${risk.file}:${formatLines(risk.lines)}`;
  const sideNote = risk.side === 'old' ? html`<span class="muted"> (removed lines)</span>` : '';
  const url = prLineUrl(prUrl, risk.file, risk.side, risk.lines);
  return url
    ? html`<a class="location mono" href="${url}" rel="noopener noreferrer" target="_blank"
        >${text}${sideNote} ${icons.external()}</a
      >`
    : html`<span class="location mono">${text}${sideNote}</span>`;
}

function riskItem(risk: DocumentRisk, prUrl: string | null): SafeHtml {
  return html`<li class="risk severity-${risk.severity}" id="risk-${risk.id}">
    <div class="risk-head">
      <span class="severity-badge">${icons.alert()}${SEVERITY_LABELS[risk.severity]}</span>
      <h3 class="risk-title">${inline(risk.title)}</h3>
    </div>
    ${location(risk, prUrl)}
    <p class="risk-reason">${inline(risk.reason)}</p>
  </li>`;
}

function countLine(risks: readonly DocumentRisk[]): string {
  const counts = (['high', 'medium', 'low'] as const).map(
    (severity) => `${risks.filter((risk) => risk.severity === severity).length} ${severity}`,
  );
  return counts.join(' · ');
}

/** Risks color-coded by severity and sorted high → low, each with a file and line citation. */
export function risksSection(doc: ExplainerDocument): SafeHtml {
  const risks = sortRisks(doc.risks);
  return html`<section class="section" id="risks" aria-labelledby="risks-title">
    <div class="section-head">
      <h2 id="risks-title">Risks</h2>
      ${risks.length > 0 ? html`<p class="section-note">${countLine(risks)}</p>` : ''}
    </div>
    ${
      risks.length === 0
        ? html`<div class="empty card">
            ${icons.shield()}
            <div>
              <p><strong>No concrete risks found.</strong></p>
              <p class="muted">
                The model reports a risk only when it can cite the exact lines and the failure
                mechanism. This is not proof that the change is safe.
              </p>
            </div>
          </div>`
        : html`<ol class="risk-list">
            ${risks.map((risk) => riskItem(risk, doc.meta.pr_url))}
          </ol>`
    }
  </section>`;
}
