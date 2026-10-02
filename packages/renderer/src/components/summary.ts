import type { ExplainerDocument } from '@lucidiff/core/schema';
import { html, type SafeHtml } from '../html';
import { paragraphs, plural } from '../text';

function riskTone(doc: ExplainerDocument): { label: string; tone: string } {
  const high = doc.risks.filter((risk) => risk.severity === 'high').length;
  const medium = doc.risks.filter((risk) => risk.severity === 'medium').length;
  if (high > 0) return { label: `${high} high`, tone: 'high' };
  if (medium > 0) return { label: `${medium} medium`, tone: 'medium' };
  if (doc.risks.length > 0) return { label: 'low only', tone: 'low' };
  return { label: 'none found', tone: 'none' };
}

/** The summary paragraph and a row of at-a-glance cards that link to each section. */
export function summarySection(doc: ExplainerDocument): SafeHtml {
  const tone = riskTone(doc);
  return html`<section class="section" id="summary" aria-labelledby="summary-title">
    <h2 id="summary-title">Summary</h2>
    <div class="prose summary">${paragraphs(doc.summary)}</div>
    <ul class="glance" aria-label="At a glance">
      <li>
        <a href="#changes"
          ><span class="glance-value">${plural(doc.changes.length, 'file')}</span
          ><span class="glance-label">explained</span></a
        >
      </li>
      <li>
        <a href="#risks" class="glance-${tone.tone}"
          ><span class="glance-value">${plural(doc.risks.length, 'risk')}</span
          ><span class="glance-label">${tone.label}</span></a
        >
      </li>
      <li>
        <a href="#tests"
          ><span class="glance-value">${plural(doc.tests.length, 'check')}</span
          ><span class="glance-label">to verify</span></a
        >
      </li>
    </ul>
  </section>`;
}
