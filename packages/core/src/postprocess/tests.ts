import type { DocumentTest } from '../schema/document';
import type { LlmTest } from '../schema/llm';
import { stableId } from './ids';
import type { FileIndex } from './paths';
import { clampText } from './text';

/** More checks than this stops being a checklist anyone finishes. */
export const MAX_TESTS = 12;

/**
 * Cleans the reviewer checklist: drops empty and duplicate items, keeps only related files
 * that are in the diff, caps the length, and assigns stable ids.
 */
export function cleanTests(tests: readonly LlmTest[], index: FileIndex): DocumentTest[] {
  const seen = new Set<string>();
  const out: DocumentTest[] = [];
  for (const test of tests) {
    const description = clampText(test.description, 600);
    const key = description.toLowerCase().replace(/\W+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const related = new Set<string>();
    for (const path of test.related_files) {
      const file = index.find(path);
      if (file) related.add(file.path);
    }
    out.push({ id: stableId('t', description), description, related_files: [...related] });
    if (out.length === MAX_TESTS) break;
  }
  return out;
}
