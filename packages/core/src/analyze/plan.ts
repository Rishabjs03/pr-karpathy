/**
 * Plans how to send a PR to the model within a token budget.
 *
 * - If the numbered diff fits in one call, use one call, then add full file contents for
 *   context while the budget allows (the new version of the most-changed files first).
 * - If it does not fit, split the files into batches (map-reduce, see `./batched.ts`). Each
 *   batch gets its own context budget.
 * - A file whose diff alone exceeds the batch budget is split into parts by whole hunks, and
 *   the parts go to different batches. Only a single hunk that is larger than the budget
 *   (usually a generated or data file) makes the file "too-large".
 */
import type { FileContents, PreparedChangeSet } from '../changeset';
import { estimateTokens, formatFileContent, formatFileDiff } from '../diff/format';
import type { DiffFile, DiffHunk } from '../diff/types';
import { buildUserPrompt } from '../prompts/user-message';

export interface BudgetOptions {
  /** Most input tokens for a single call (system prompt included). */
  maxInputTokens: number;
  /** Most input tokens for one batch call in batched mode. */
  batchInputTokens: number;
  /** Include full file contents for context. */
  includeContents: boolean;
  /** Skip the contents of any single file larger than this many tokens. */
  maxContentTokensPerFile: number;
}

export const DEFAULT_BUDGET: BudgetOptions = {
  maxInputTokens: 150_000,
  batchInputTokens: 60_000,
  includeContents: true,
  maxContentTokensPerFile: 30_000,
};

export type ContentSelection = Map<string, Partial<FileContents>>;

export interface Batch {
  files: DiffFile[];
  contents: ContentSelection;
}

export type AnalysisPlan =
  | { mode: 'single'; contents: ContentSelection; estimatedTokens: number; tooLarge: DiffFile[] }
  | { mode: 'batched'; batches: Batch[]; estimatedTokens: number; tooLarge: DiffFile[] };

function contentTokens(text: string): number {
  return estimateTokens(formatFileContent(text)) + 20;
}

/**
 * Adds file contents to `selection` while they fit in `budget` tokens. Returns tokens used.
 * The new version of each file comes first (most changed files first), then old versions of
 * modified files, which matter less because the diff already shows the removed lines.
 */
function selectContents(
  files: readonly DiffFile[],
  contents: PreparedChangeSet['contents'],
  budget: number,
  options: BudgetOptions,
  selection: ContentSelection,
): number {
  if (!options.includeContents || budget <= 0) return 0;
  const ordered = [...files].sort(
    (a, b) => b.additions + b.deletions - (a.additions + a.deletions),
  );
  let used = 0;
  const tryAdd = (path: string, side: 'head' | 'base', text: string | null | undefined) => {
    if (!text) return;
    const cost = contentTokens(text);
    if (cost > options.maxContentTokensPerFile || used + cost > budget) return;
    selection.set(path, { ...selection.get(path), [side]: text });
    used += cost;
  };
  for (const file of ordered) {
    const entry = contents.get(file.path);
    if (!entry) continue;
    if (file.kind === 'deleted') tryAdd(file.path, 'base', entry.base);
    else tryAdd(file.path, 'head', entry.head);
  }
  for (const file of ordered) {
    if (file.kind !== 'modified' && file.kind !== 'renamed') continue;
    tryAdd(file.path, 'base', contents.get(file.path)?.base);
  }
  return used;
}

const FILE_OVERHEAD = 30;

function diffTokens(file: DiffFile): number {
  return estimateTokens(formatFileDiff(file)) + FILE_OVERHEAD;
}

function countLines(hunks: readonly DiffHunk[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of hunks.flatMap((hunk) => hunk.lines)) {
    if (line.type === 'add') additions += 1;
    else if (line.type === 'delete') deletions += 1;
  }
  return { additions, deletions };
}

/**
 * Splits a file's diff into parts of whole hunks that each fit in `budget` tokens.
 * Returns null when one hunk alone is larger than the budget.
 */
export function splitFileByHunks(file: DiffFile, budget: number): DiffFile[] | null {
  const groups: DiffHunk[][] = [];
  let group: DiffHunk[] = [];
  for (const hunk of file.hunks) {
    if (diffTokens({ ...file, hunks: [hunk] }) > budget) return null;
    if (group.length > 0 && diffTokens({ ...file, hunks: [...group, hunk] }) > budget) {
      groups.push(group);
      group = [];
    }
    group.push(hunk);
  }
  if (group.length > 0) groups.push(group);
  return groups.map((hunks, index) => ({
    ...file,
    hunks,
    ...countLines(hunks),
    part: { index: index + 1, total: groups.length },
  }));
}

/**
 * Decides between one call and batched calls, and which file contents to include.
 *
 * @param prepared - The filtered and redacted change set.
 * @param systemTokens - Estimated tokens of the system prompt for a single call.
 * @param batchSystemTokens - Estimated tokens of the system prompt for a batch call.
 */
export function planAnalysis(
  prepared: PreparedChangeSet,
  systemTokens: number,
  batchSystemTokens: number,
  options: BudgetOptions = DEFAULT_BUDGET,
): AnalysisPlan {
  const baseTokens =
    systemTokens +
    estimateTokens(
      buildUserPrompt({
        source: prepared.source,
        pr: prepared.pr,
        files: prepared.files,
        skipped: prepared.skipped,
        contents: new Map(),
      }),
    );

  if (baseTokens <= options.maxInputTokens) {
    const contents: ContentSelection = new Map();
    const used = selectContents(
      prepared.files,
      prepared.contents,
      options.maxInputTokens - baseTokens,
      options,
      contents,
    );
    return { mode: 'single', contents, estimatedTokens: baseTokens + used, tooLarge: [] };
  }

  // Fixed cost of every batch call: system prompt, PR metadata, and the list of all files.
  const overhead =
    batchSystemTokens +
    estimateTokens(
      buildUserPrompt({
        source: prepared.source,
        pr: prepared.pr,
        files: [],
        skipped: prepared.skipped,
        contents: new Map(),
        otherFiles: prepared.files,
      }),
    );
  const diffBudget = options.batchInputTokens - overhead;

  const batches: Batch[] = [];
  const tooLarge: DiffFile[] = [];
  let current: DiffFile[] = [];
  let currentTokens = 0;
  const add = (file: DiffFile, tokens: number) => {
    if (currentTokens + tokens > diffBudget && current.length > 0) {
      batches.push({ files: current, contents: new Map() });
      current = [];
      currentTokens = 0;
    }
    current.push(file);
    currentTokens += tokens;
  };
  for (const file of prepared.files) {
    const tokens = diffTokens(file);
    if (tokens <= diffBudget) {
      add(file, tokens);
      continue;
    }
    const parts = splitFileByHunks(file, diffBudget);
    if (!parts) {
      tooLarge.push(file);
      continue;
    }
    for (const part of parts) add(part, diffTokens(part));
  }
  if (current.length > 0) batches.push({ files: current, contents: new Map() });

  let estimatedTokens = 0;
  for (const batch of batches) {
    const used = batch.files.reduce((sum, file) => sum + diffTokens(file), 0);
    const context = selectContents(
      batch.files,
      prepared.contents,
      diffBudget - used,
      options,
      batch.contents,
    );
    estimatedTokens += overhead + used + context;
  }
  return { mode: 'batched', batches, estimatedTokens, tooLarge };
}
