import type { ExplainerDocument } from '@lucidiff/core/schema';
import { html, type SafeHtml } from '../html';
import { inline, splitPath } from '../text';

/** The reviewer checklist. The page script saves checkbox state in localStorage. */
export function testsSection(doc: ExplainerDocument): SafeHtml {
  const total = doc.tests.length;
  return html`<section class="section" id="tests" aria-labelledby="tests-title">
    <div class="section-head">
      <h2 id="tests-title">Test checklist</h2>
      ${
        total > 0
          ? html`<div class="section-tools">
              <span class="section-note" data-check-progress aria-live="polite"
                >0 of ${total} done</span
              >
              <button type="button" class="text-button" data-check-reset>Reset</button>
            </div>`
          : ''
      }
    </div>
    ${
      total === 0
        ? html`<p class="empty">The model did not suggest any checks.</p>`
        : html`<div class="progress" aria-hidden="true">
              <span class="progress-bar" data-check-bar></span>
            </div>
            <ul class="checklist">
              ${doc.tests.map(
                (test) =>
                  html`<li>
                    <label class="check">
                      <input type="checkbox" data-check-id="${test.id}" />
                      <span class="check-box" aria-hidden="true"></span>
                      <span class="check-text">${inline(test.description)}</span>
                    </label>
                    ${
                      test.related_files.length > 0
                        ? html`<ul class="related" aria-label="Related files">
                            ${test.related_files.map(
                              (file) =>
                                html`<li><code title="${file}">${splitPath(file).base}</code></li>`,
                            )}
                          </ul>`
                        : ''
                    }
                  </li>`,
              )}
            </ul>`
    }
  </section>`;
}
