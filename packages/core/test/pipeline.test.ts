import { describe, expect, it } from 'vitest';
import {
  changeSetFromDiff,
  estimateTokens,
  explain,
  filterFiles,
  parseUnifiedDiff,
  planAnalysis,
  prompts,
  redactChangeSet,
  UserError,
  type Explanation,
} from '../src';
import { fixtureDiff, mockModel } from './helpers';

const NOW = () => new Date('2026-10-02T12:00:00.000Z');

/** A plausible model answer for fixtures/diffs/medium.diff. */
function mediumExplanation(overrides: Partial<Explanation> = {}): Explanation {
  return {
    title: 'Harden file uploads against path traversal and large bodies',
    summary:
      '`handleUpload` now strips directory parts from the file name and limits uploads to 10 MB.\n\nThe server also lowers the rate limit from 100 to 20 requests per minute.',
    changes: [
      {
        file: 'src/api/upload.ts',
        what: 'Adds `safeFileName` and a `limitSize` transform, and checks the content type.',
        why: 'Clients can no longer write outside `UPLOAD_DIR`.',
      },
      {
        file: 'src/invented.ts',
        what: 'A file the model made up.',
        why: 'It is not in the diff.',
      },
    ],
    flow: {
      caption: 'Requests reach `handleUpload`, which writes to disk.',
      nodes: [
        { id: 'server', label: 'server', kind: 'entry', file: 'src/api/server.ts', changed: true },
        {
          id: 'upload',
          label: 'handleUpload',
          kind: 'function',
          file: 'src/api/upload.ts',
          changed: true,
        },
        { id: 'disk', label: 'UPLOAD_DIR', kind: 'data', file: null, changed: false },
      ],
      edges: [
        { from: 'server', to: 'upload', label: 'POST /upload' },
        { from: 'upload', to: 'disk', label: 'write stream' },
      ],
    },
    risks: [
      {
        severity: 'medium',
        title: 'Partial file left on disk after a size error',
        file: 'src/api/upload.ts',
        side: 'new',
        start_line: 40,
        end_line: 42,
        reason:
          '`pipeline` rejects when `limitSize` errors, but the partly written file is never deleted.',
      },
      {
        severity: 'high',
        title: 'Invented file',
        file: 'src/invented.ts',
        side: 'new',
        start_line: 1,
        end_line: 2,
        reason: 'This risk cites a file that is not part of the diff at all.',
      },
      {
        severity: 'low',
        title: 'Outside the hunks',
        file: 'src/api/server.ts',
        side: 'new',
        start_line: 400,
        end_line: 401,
        reason: 'This risk cites lines that the pull request does not touch.',
      },
    ],
    tests: [
      {
        description: 'Upload a file named `../../etc/passwd` and confirm it is stored as `passwd`.',
        related_files: ['src/api/upload.ts', 'src/nope.ts'],
      },
      { description: 'Upload an 11 MB PDF and confirm the response is 413.', related_files: [] },
      { description: 'Upload an 11 MB PDF and confirm the response is 413.', related_files: [] },
    ],
    ...overrides,
  };
}

describe('explain', () => {
  it('turns a diff into a validated document', async () => {
    const model = mockModel([mediumExplanation()]);
    const { document } = await explain(
      { kind: 'diff', diff: fixtureDiff('medium.diff'), label: 'medium.diff' },
      { model, now: NOW },
    );

    expect(document.schema_version).toBe(1);
    expect(document.title).toBe('Harden file uploads against path traversal and large bodies');
    expect(document.meta).toMatchObject({
      model: 'mock-model',
      provider: 'mock',
      generated_at: '2026-10-02T12:00:00.000Z',
      pr_url: null,
      mode: 'single',
      source: { kind: 'diff', label: 'medium.diff' },
      stats: { files_changed: 2, files_analyzed: 2 },
    });
    expect(document.meta.usage.llm_calls).toBe(1);
    expect(document.meta.usage.input_tokens).toBeGreaterThan(0);
  });

  it('fills change facts from the diff and lists every analyzed file once', async () => {
    const { document } = await explain(
      { kind: 'diff', diff: fixtureDiff('medium.diff') },
      { model: mockModel([mediumExplanation()]), now: NOW },
    );
    expect(document.changes.map((change) => change.file)).toEqual([
      'src/api/upload.ts',
      'src/api/server.ts',
    ]);
    const upload = parseUnifiedDiff(fixtureDiff('medium.diff')).find(
      (f) => f.path === 'src/api/upload.ts',
    )!;
    expect(document.changes[0]).toMatchObject({
      kind: 'modified',
      additions: upload.additions,
      deletions: upload.deletions,
    });
    // The model did not describe server.ts, so it has no text, and invented.ts is gone.
    expect(document.changes[1]).toMatchObject({ what: null, why: null });
  });

  it('drops risks whose citations do not hold up', async () => {
    const { document, droppedRisks } = await explain(
      { kind: 'diff', diff: fixtureDiff('medium.diff') },
      { model: mockModel([mediumExplanation()]), now: NOW },
    );
    expect(document.risks).toHaveLength(1);
    expect(document.risks[0]).toMatchObject({
      file: 'src/api/upload.ts',
      lines: [40, 42],
      side: 'new',
    });
    expect(document.risks[0]!.id).toMatch(/^r_[0-9a-f]{10}$/);
    expect(document.meta.dropped_risks).toBe(2);
    expect(droppedRisks.map((entry) => entry.reason)).toEqual([
      '"src/invented.ts" is not a file in this diff',
      'new lines 400-401 of src/api/server.ts are outside the changed hunks',
    ]);
  });

  it('cleans the checklist', async () => {
    const { document } = await explain(
      { kind: 'diff', diff: fixtureDiff('medium.diff') },
      { model: mockModel([mediumExplanation()]), now: NOW },
    );
    expect(document.tests).toHaveLength(2);
    expect(document.tests[0]!.related_files).toEqual(['src/api/upload.ts']);
    expect(document.tests[0]!.id).toMatch(/^t_[0-9a-f]{10}$/);
  });

  it('compiles the flow graph to Mermaid', async () => {
    const { document } = await explain(
      { kind: 'diff', diff: fixtureDiff('medium.diff') },
      { model: mockModel([mediumExplanation()]), now: NOW },
    );
    expect(document.flow.mermaid).toContain('n_server(["server"])');
    expect(document.flow.mermaid).toContain('n_upload -->|"write stream"| n_disk');
  });

  it('repairs a broken flow graph with one extra call', async () => {
    const broken = mediumExplanation();
    broken.flow.edges.push({ from: 'upload', to: 'ghost', label: null });
    const fixed = { ...mediumExplanation().flow };
    const model = mockModel([broken, fixed]);
    const { document, warnings } = await explain(
      { kind: 'diff', diff: fixtureDiff('medium.diff') },
      { model, now: NOW },
    );
    expect(document.flow.mermaid).not.toBeNull();
    expect(document.meta.usage.llm_calls).toBe(2);
    expect(warnings).toEqual([]);
    // The repair call received the exact problem.
    expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).toContain('upload -> ghost');
  });

  it('falls back to a text flow when the repair also fails', async () => {
    const broken = mediumExplanation();
    broken.flow.edges.push({ from: 'upload', to: 'ghost', label: null });
    const stillBroken = { ...broken.flow };
    const { document, warnings } = await explain(
      { kind: 'diff', diff: fixtureDiff('medium.diff') },
      { model: mockModel([broken, stillBroken]), now: NOW },
    );
    expect(document.flow.mermaid).toBeNull();
    expect(document.flow.nodes).toHaveLength(3);
    expect(warnings).toContain('The flow diagram failed validation and is shown as a text list.');
  });

  it('retries once when the model returns output that does not match the schema', async () => {
    const model = mockModel(['{"title": "incomplete"', mediumExplanation()]);
    const { document } = await explain(
      { kind: 'diff', diff: fixtureDiff('medium.diff') },
      { model, now: NOW },
    );
    expect(document.title).toContain('Harden file uploads');
    expect(document.meta.usage.llm_calls).toBe(2);
    expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).toContain('previous_attempt_error');
  });

  it('redacts secrets before anything reaches the model', async () => {
    const secret = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
    const diff = [
      'diff --git a/src/client.ts b/src/client.ts',
      '--- a/src/client.ts',
      '+++ b/src/client.ts',
      '@@ -1,1 +1,2 @@',
      ' export const api = "https://api.example.com";',
      `+export const token = "${secret}";`,
    ].join('\n');
    const model = mockModel([
      mediumExplanation({
        changes: [],
        risks: [],
        flow: {
          ...mediumExplanation().flow,
          nodes: mediumExplanation().flow.nodes.map((n) => ({ ...n, file: null })),
        },
      }),
    ]);
    const { document } = await explain({ kind: 'diff', diff }, { model, now: NOW });
    const sent = JSON.stringify(model.doStreamCalls[0]!.prompt);
    expect(sent).not.toContain(secret);
    expect(sent).toContain('[REDACTED:github-token]');
    expect(document.meta.redactions).toBe(1);
  });

  it('can skip redaction when explicitly disabled', async () => {
    const diff =
      'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-x\n+const key = "sk-ant-abcdefghijklmnopqrstuvwxyz0123";\n';
    const model = mockModel([mediumExplanation({ changes: [], risks: [] })]);
    await explain({ kind: 'diff', diff }, { model, now: NOW, redact: false });
    expect(JSON.stringify(model.doStreamCalls[0]!.prompt)).toContain(
      'sk-ant-abcdefghijklmnopqrstuvwxyz0123',
    );
  });

  it('skips lockfiles and binaries and lists them in the document', async () => {
    const diff = [
      fixtureDiff('multi-file.diff'),
      'diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml',
      '--- a/pnpm-lock.yaml',
      '+++ b/pnpm-lock.yaml',
      '@@ -1 +1 @@',
      '-lockfileVersion: 9.0',
      "+lockfileVersion: '9.0'",
    ].join('\n');
    const model = mockModel([mediumExplanation({ changes: [], risks: [] })]);
    const { document } = await explain({ kind: 'diff', diff }, { model, now: NOW });
    expect(document.skipped_files).toEqual([
      { file: 'docs/logo.png', reason: 'binary' },
      { file: 'pnpm-lock.yaml', reason: 'ignored' },
    ]);
    const sent = JSON.stringify(model.doStreamCalls[0]!.prompt);
    expect(sent).not.toContain('lockfileVersion');
    expect(document.meta.stats).toMatchObject({ files_changed: 6, files_analyzed: 4 });
  });

  it('fails clearly when every file is skipped', async () => {
    const diff =
      'diff --git a/yarn.lock b/yarn.lock\n--- a/yarn.lock\n+++ b/yarn.lock\n@@ -1 +1 @@\n-a\n+b\n';
    await expect(explain({ kind: 'diff', diff }, { model: mockModel([{}]) })).rejects.toThrow(
      /were skipped.*--include/,
    );
  });

  it('fails clearly on input that is not a diff', async () => {
    await expect(
      explain({ kind: 'diff', diff: 'hello world' }, { model: mockModel([{}]) }),
    ).rejects.toBeInstanceOf(UserError);
  });

  it('fails before any work when no API key is configured', async () => {
    await expect(
      explain({ kind: 'diff', diff: fixtureDiff('small.diff') }, { env: {} }),
    ).rejects.toThrow(/No LLM provider is configured/);
  });

  it('reports progress for every stage', async () => {
    const stages: string[] = [];
    await explain(
      { kind: 'diff', diff: fixtureDiff('medium.diff') },
      {
        model: mockModel([mediumExplanation()]),
        now: NOW,
        onProgress: (event) => {
          if (event.type !== 'update') stages.push(`${event.stage}:${event.type}`);
        },
      },
    );
    expect(stages).toEqual([
      'load:start',
      'load:end',
      'prepare:start',
      'prepare:end',
      'analyze:start',
      'analyze:end',
      'validate:start',
      'validate:end',
    ]);
  });

  it('sends the numbered diff and the accuracy rules to the model', async () => {
    const model = mockModel([mediumExplanation()]);
    await explain({ kind: 'diff', diff: fixtureDiff('small.diff') }, { model, now: NOW });
    const [system, user] = model.doStreamCalls[0]!.prompt;
    expect(JSON.stringify(system)).toContain('Zero risks is a valid and common answer');
    expect(JSON.stringify(user)).toContain('   11 +  ');
  });
});

describe('explain on large PRs', () => {
  it('splits the PR into batches and combines them', async () => {
    const batch = (file: string) => ({
      changes: [{ file, what: `Changes \`${file}\`.`, why: 'It matters.' }],
      risks: [],
      test_ideas: [{ description: `Check ${file} by running its tests.`, related_files: [file] }],
      notes: `${file} connects to the server.`,
    });
    const overview = {
      title: 'Add metrics and remove dead code',
      summary: 'The server counts requests.',
      flow: mediumExplanation().flow,
      tests: [
        {
          description: 'Request `/metrics` and confirm it returns JSON.',
          related_files: ['src/api/server.ts'],
        },
      ],
    };
    const model = mockModel((call) => {
      if (call.schemaName === 'pr_overview') return overview;
      // Explain exactly the files listed in this batch's <changed_files> section.
      const section = /<changed_files>([\s\S]*?)<\/changed_files>/.exec(call.prompt)?.[1] ?? '';
      const files = [...section.matchAll(/^- (\S+)/gm)].map((match) => match[1]!);
      const parts = files.map(batch);
      return {
        changes: parts.flatMap((part) => part.changes),
        risks: [],
        test_ideas: parts.flatMap((part) => part.test_ideas),
        notes: parts.map((part) => part.notes).join(' '),
      };
    });
    // Find the smallest batch budget that still fits every file, so the PR splits into batches.
    const changeSet = changeSetFromDiff(fixtureDiff('multi-file.diff'));
    const { files, skipped } = filterFiles(changeSet.files);
    const prepared = redactChangeSet({ ...changeSet, files, skipped });
    let batchInputTokens = 2000;
    for (; batchInputTokens < 20_000; batchInputTokens += 50) {
      const plan = planAnalysis(
        prepared,
        estimateTokens(prompts.EXPLAINER_SYSTEM_PROMPT),
        estimateTokens(prompts.BATCH_SYSTEM_PROMPT),
        {
          maxInputTokens: 1000,
          batchInputTokens,
          includeContents: false,
          maxContentTokensPerFile: 0,
        },
      );
      if (plan.mode === 'batched' && plan.batches.length > 0 && plan.tooLarge.length === 0) break;
    }

    const { document } = await explain(
      { kind: 'diff', diff: fixtureDiff('multi-file.diff') },
      { model, now: NOW, concurrency: 1, budget: { maxInputTokens: 1000, batchInputTokens } },
    );
    expect(document.meta.mode).toBe('batched');
    const calls = model.doStreamCalls.length;
    expect(calls).toBeGreaterThan(2);
    expect(document.meta.usage.llm_calls).toBe(calls);
    expect(document.title).toBe('Add metrics and remove dead code');
    expect(document.changes.every((change) => change.what !== null)).toBe(true);
    // The combining call sees the batch notes, not the diff.
    const combine = JSON.stringify(model.doStreamCalls[calls - 1]!.prompt);
    expect(combine).toContain('connects to the server');
    expect(combine).not.toContain('OLD   NEW');
  });
});
