import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../src/diff/parse';
import { mergeChanges } from '../src/postprocess/changes';
import { FileIndex } from '../src/postprocess/paths';
import { fixtureDiff } from './helpers';

const index = new FileIndex(parseUnifiedDiff(fixtureDiff('rename.diff')));

describe('mergeChanges', () => {
  it('takes kind, counts, and rename source from the diff', () => {
    const { changes } = mergeChanges(
      [
        {
          file: 'src/config/load.ts',
          what: 'Parses `PORT` with `parseInt`.',
          why: 'Avoids `NaN`.',
        },
      ],
      index,
    );
    expect(changes[0]).toEqual({
      file: 'src/config/load.ts',
      old_file: 'src/lib/config.ts',
      kind: 'renamed',
      additions: 1,
      deletions: 1,
      what: 'Parses `PORT` with `parseInt`.',
      why: 'Avoids `NaN`.',
    });
  });

  it('accepts the old path of a renamed file', () => {
    const { changes } = mergeChanges(
      [{ file: 'src/lib/config.ts', what: 'Moved.', why: 'Layout.' }],
      index,
    );
    expect(changes[0]?.file).toBe('src/config/load.ts');
  });

  it('joins explanations of the parts of a split file', () => {
    const { changes } = mergeChanges(
      [
        { file: 'src/config/load.ts', what: 'Part one.', why: 'Reason one.' },
        { file: 'src/config/load.ts', what: 'Part two.', why: 'Reason one.' },
      ],
      index,
    );
    expect(changes[0]).toMatchObject({ what: 'Part one. Part two.', why: 'Reason one.' });
  });

  it('lists files the model skipped, after the described ones', () => {
    const { changes } = mergeChanges([{ file: 'src/config/load.ts', what: 'x', why: 'y' }], index);
    expect(changes.map((change) => [change.file, change.what])).toEqual([
      ['src/config/load.ts', 'x'],
      ['docs/index.md', null],
    ]);
  });

  it('reports explanations for files that are not in the diff', () => {
    expect(mergeChanges([{ file: 'nope.ts', what: 'x', why: 'y' }], index).unknownFiles).toEqual([
      'nope.ts',
    ]);
  });
});
