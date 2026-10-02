import { createHash } from 'node:crypto';

/**
 * Returns a short identifier derived from content, e.g. `t_3f9a0c12be`.
 *
 * The same content always gets the same id. The page uses test ids to save checkbox state, so
 * a check that survives a re-run of lucidiff keeps its checked state.
 */
export function stableId(prefix: string, ...parts: (string | number)[]): string {
  const hash = createHash('sha256').update(parts.join('\u0000')).digest('hex');
  return `${prefix}_${hash.slice(0, 10)}`;
}
