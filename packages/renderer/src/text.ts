/**
 * Formatting for text written by the model.
 *
 * The model writes plain text. We support exactly one piece of markup: `backticks` become
 * inline code, because the writing rules ask the model to name real functions and files.
 * Everything else is escaped.
 */
import { escapeHtml, raw, type SafeHtml } from './html';

/**
 * Code spans up to this length never wrap, so a flag such as `-orecord.log` is not split
 * after its leading dash. Longer spans (paths, long identifiers) may wrap on narrow screens.
 */
const NOWRAP_CODE_MAX = 28;

/** Escapes text and turns `backtick spans` into `<code>` elements. */
export function inline(text: string): SafeHtml {
  const parts = text.split(/(`[^`\n]+`)/g);
  const out = parts
    .map((part) => {
      if (!(part.length > 2 && part.startsWith('`') && part.endsWith('`'))) return escapeHtml(part);
      const code = part.slice(1, -1);
      const attribute = code.length <= NOWRAP_CODE_MAX ? ' class="nowrap"' : '';
      return `<code${attribute}>${escapeHtml(code)}</code>`;
    })
    .join('');
  return raw(out);
}

/** Removes the backticks from code spans, for plain-text contexts such as `<title>`. */
export function plainText(text: string): string {
  return text.replace(/`([^`\n]+)`/g, '$1');
}

/** Splits text on blank lines and renders each block as a paragraph. */
export function paragraphs(text: string): SafeHtml {
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  return raw(blocks.map((block) => `<p>${inline(block).value}</p>`).join(''));
}

/** Splits a path into directory and file name, for display. */
export function splitPath(path: string): { dir: string; base: string } {
  const index = path.lastIndexOf('/');
  return index === -1
    ? { dir: '', base: path }
    : { dir: path.slice(0, index + 1), base: path.slice(index + 1) };
}

/** Formats a number with thousands separators, independent of the machine locale. */
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/** Formats a 1-based line range as "12" or "12–18". */
export function formatLines([start, end]: readonly [number, number]): string {
  return start === end ? `${start}` : `${start}–${end}`;
}

/** Pluralizes a simple English noun. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}
