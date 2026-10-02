/**
 * A tiny HTML templating helper with automatic escaping.
 *
 * Every interpolated value is escaped unless it is already `SafeHtml` (the result of another
 * `html` template or of `raw`). This makes the safe path the default: text written by the
 * model can never become markup by accident.
 *
 * @example
 *   html`<p class="note">${userText}</p>`         // userText is escaped
 *   html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`  // arrays are joined
 */

const SAFE = Symbol('safe-html');

export interface SafeHtml {
  readonly [SAFE]: true;
  readonly value: string;
  toString(): string;
}

/** Marks a string as trusted HTML. Use only for markup this package generates itself. */
export function raw(value: string): SafeHtml {
  return { [SAFE]: true, value, toString: () => value };
}

function isSafeHtml(value: unknown): value is SafeHtml {
  return typeof value === 'object' && value !== null && SAFE in value;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for safe use in HTML element content and quoted attribute values. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  if (isSafeHtml(value)) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  return escapeHtml(String(value));
}

/** Tagged template that escapes interpolations. Returns `SafeHtml`. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0] ?? '';
  for (let index = 0; index < values.length; index += 1) {
    out += renderValue(values[index]) + (strings[index + 1] ?? '');
  }
  return raw(out);
}

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/**
 * Serializes data for a `<script type="application/json">` block.
 *
 * Escapes `<` so the content can never close the script element, plus the two line
 * separators that are valid in JSON but not in older JavaScript parsers.
 */
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replaceAll(LINE_SEPARATOR, '\\u2028')
    .replaceAll(PARAGRAPH_SEPARATOR, '\\u2029');
}
