/**
 * Regenerates the committed examples in examples/<name>/. Run `pnpm build` first.
 *
 *   pnpm examples            Replay: run the stored model output (model-output.json) through
 *                            the real pipeline again (citation checks, flow compile, render).
 *                            No API key or network needed. Use this after renderer changes.
 *   pnpm examples --live     Call the model for real on each PR URL. Needs a provider key and
 *                            GitHub access, and overwrites model-output.json.
 *
 * Each example folder holds:
 *   source.json         The PR: URL, title, base branch, commit, and license of the project.
 *   pr.diff             The PR diff, as `git diff` prints it.
 *   model-output.json   The model's answer (the ExplanationSchema JSON).
 *   explainer.json      The validated explainer document (generated).
 *   index.html          The rendered page (generated).
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { explain, parseUnifiedDiff } from '@lucidiff/core';
import { renderHtml } from '@lucidiff/renderer';
import { MockLanguageModelV4 } from 'ai/test';

const live = process.argv.includes('--live');
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const root = path.resolve('examples');

/** A model that "answers" with a stored response and reports no token usage. */
function replayModel(output, modelId) {
  const text = JSON.stringify(output);
  return new MockLanguageModelV4({
    provider: 'replay',
    modelId,
    doStream: async (options) => {
      // A flow repair call gets the stored flow; every other call gets the full answer.
      const isRepair = options.responseFormat?.name === 'flow_graph';
      const body = isRepair ? JSON.stringify(output.flow) : text;
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 't' });
            controller.enqueue({ type: 'text-delta', id: 't', delta: body });
            controller.enqueue({ type: 'text-end', id: 't' });
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 0, text: 0, reasoning: 0 },
              },
            });
            controller.close();
          },
        }),
      };
    },
  });
}

async function replay(dir, source) {
  const diff = await readFile(path.join(dir, 'pr.diff'), 'utf8');
  const output = JSON.parse(await readFile(path.join(dir, 'model-output.json'), 'utf8'));
  const loaded = {
    changeSet: {
      source: {
        kind: 'github',
        label: `${source.repository}#${source.number}`,
        repository: source.repository,
        base_ref: source.base_ref,
        head_ref: source.head_ref,
        author: source.author,
      },
      pr: {
        url: source.url,
        number: source.number,
        title: source.title,
        description: source.description,
      },
      files: parseUnifiedDiff(diff),
      contents: new Map(),
      skipped: [],
    },
  };
  return explain(
    { kind: 'loaded', loaded },
    { model: replayModel(output, source.model), now: () => new Date(source.generated_at) },
  );
}

const names = (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && (only.length === 0 || only.includes(entry.name)))
  .map((entry) => entry.name)
  .sort();

let failures = 0;
for (const name of names) {
  const dir = path.join(root, name);
  const source = JSON.parse(await readFile(path.join(dir, 'source.json'), 'utf8'));
  const result = live
    ? await explain({ kind: 'github', url: source.url })
    : await replay(dir, source);
  const { document, droppedRisks, warnings } = result;

  await writeFile(path.join(dir, 'explainer.json'), `${JSON.stringify(document, null, 2)}\n`);
  // Examples load the pinned Mermaid build from the CDN. Embedding it (--offline) would add
  // about 5 MB per page to the repository.
  await writeFile(path.join(dir, 'index.html'), renderHtml(document));

  console.log(
    `${name}: ${document.changes.length} files, ${document.risks.length} risks, ${document.tests.length} checks, flow ${document.flow.mermaid ? 'ok' : 'FALLBACK'}`,
  );
  for (const { risk, reason } of droppedRisks) {
    failures += 1;
    console.log(`  dropped risk "${risk.title}": ${reason}`);
  }
  for (const warning of warnings) console.log(`  warning: ${warning}`);
}
if (failures > 0) process.exitCode = 1;
