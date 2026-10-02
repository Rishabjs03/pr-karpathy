import type { ChangeKind, DocumentChange, ExplainerDocument } from '@lucidiff/core/schema';
import { html, type SafeHtml } from '../html';
import { icons } from '../icons';
import { prFileUrl } from '../links';
import { formatNumber, inline, splitPath } from '../text';

const KIND_LABELS: Record<ChangeKind, string> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
};

/** Cards start open when there are few of them; long lists start collapsed for scanning. */
const OPEN_BY_DEFAULT_MAX = 4;

function pathLabel(path: string): SafeHtml {
  const { dir, base } = splitPath(path);
  return html`<span class="path mono" title="${path}"
    ><span class="path-dir">${dir}</span><span class="path-base">${base}</span></span
  >`;
}

function changeCard(change: DocumentChange, prUrl: string | null, open: boolean): SafeHtml {
  const url = prFileUrl(prUrl, change.file);
  const described = change.what !== null;
  return html`<li>
    <details class="change" ${open ? 'open' : ''}>
      <summary>
        ${icons.chevron()}
        <span class="kind kind-${change.kind}">${KIND_LABELS[change.kind]}</span>
        ${pathLabel(change.file)}
        <span class="mono diffstat"
          ><span class="add">+${formatNumber(change.additions)}</span>
          <span class="del">−${formatNumber(change.deletions)}</span></span
        >
        ${described ? html`<span class="change-preview">${inline(change.what ?? '')}</span>` : ''}
      </summary>
      <div class="change-body">
        ${
          change.old_file
            ? html`<p class="renamed-from">Renamed from <code>${change.old_file}</code></p>`
            : ''
        }
        ${
          described
            ? html`<dl>
                <div>
                  <dt>What</dt>
                  <dd>${inline(change.what ?? '')}</dd>
                </div>
                ${
                  change.why
                    ? html`<div>
                        <dt>Why</dt>
                        <dd>${inline(change.why)}</dd>
                      </div>`
                    : ''
                }
              </dl>`
            : html`<p class="muted">The model did not describe this file. Review it directly.</p>`
        }
        ${
          url
            ? html`<a class="file-link" href="${url}" rel="noopener noreferrer" target="_blank"
                >View in pull request ${icons.external()}</a
              >`
            : ''
        }
      </div>
    </details>
  </li>`;
}

/** Collapsible per-file cards with what changed and why it matters. */
export function changesSection(doc: ExplainerDocument): SafeHtml {
  const open = doc.changes.length <= OPEN_BY_DEFAULT_MAX;
  return html`<section class="section" id="changes" aria-labelledby="changes-title">
    <div class="section-head">
      <h2 id="changes-title">Changes</h2>
      ${
        doc.changes.length > 1
          ? html`<div class="section-tools">
              <button type="button" class="text-button" data-expand="all">Expand all</button>
              <button type="button" class="text-button" data-expand="none">Collapse all</button>
            </div>`
          : ''
      }
    </div>
    ${
      doc.changes.length === 0
        ? html`<p class="empty">This diff has no files to explain.</p>`
        : html`<ul class="change-list">
            ${doc.changes.map((change) => changeCard(change, doc.meta.pr_url, open))}
          </ul>`
    }
  </section>`;
}
