import type { DiffFile } from '../diff/types';

/** Normalizes a path the model wrote: trims, and removes `./`, `a/`, `b/`, and leading slashes. */
export function normalizeModelPath(path: string): string {
  return path
    .trim()
    .replace(/^`|`$/g, '')
    .replace(/^\.\//, '')
    .replace(/^[ab]\//, '')
    .replace(/^\/+/, '');
}

/** Looks up diff files by any of their paths (new or old). */
export class FileIndex {
  private readonly byPath = new Map<string, DiffFile>();

  constructor(readonly files: readonly DiffFile[]) {
    // Index old paths first so that a new path always wins when two files share a name.
    for (const file of files) if (file.oldPath) this.byPath.set(file.oldPath, file);
    for (const file of files) {
      this.byPath.set(file.path, file);
      if (file.newPath) this.byPath.set(file.newPath, file);
    }
  }

  /** Finds the file a model-written path refers to, or undefined. */
  find(path: string): DiffFile | undefined {
    return this.byPath.get(normalizeModelPath(path));
  }

  /** All paths a node or test may refer to. */
  get paths(): Set<string> {
    return new Set(this.byPath.keys());
  }
}
