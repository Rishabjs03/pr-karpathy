/**
 * Regenerates the committed examples in examples/<name>/. Run `pnpm build` first.
 *
 *   pnpm examples            Replay: run the stored model answer (model-output.json) through
 *                            the real pipeline again (citation checks, flow compile, render).
 *                            No API key or network needed. Use this after renderer changes.
 *   pnpm examples --live     Send each pr.diff to the model, as `lucidiff pr.diff` does, then
 *                            replay the new answer. Needs a provider key. Overwrites
 *                            model-output.json and the `run` record in source.json.
 *
 * Each example folder holds:
 *   source.json         The PR (URL, title, base branch, commit, project license) and `run`,
 *                       the provider, model, time, and token usage of the live call.
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

/** A model that "answers" with a stored response and reports the live call's token usage. */
function replayModel(output, run) {
  const text = JSON.stringify(output);
  return new MockLanguageModelV4({
    provider: run.provider,
    modelId: run.model,
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
                inputTokens: {
                  total: run.input_tokens,
                  noCache: run.input_tokens,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: run.output_tokens, text: run.output_tokens, reasoning: 0 },
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
    { model: replayModel(output, source.run), now: () => new Date(source.run.generated_at) },
  );
}

/**
 * Sends pr.diff to the configured model, as `lucidiff pr.diff` does. Returns the model's answer
 * and a record of the call. If the flow needed a repair call, the answer gets the repaired flow,
 * so the replay renders what the live run rendered.
 */
async function liveAnswer(dir) {
  const diff = await readFile(path.join(dir, 'pr.diff'), 'utf8');
  const raw = {};
  const { document } = await explain(
    { kind: 'diff', diff, label: 'pr.diff' },
    {
      onDebug: (message) => {
        const match = /^Raw response \((\w+)(?:, retry)?\):\n/.exec(message);
        if (match) raw[match[1]] = message.slice(match[0].length);
      },
    },
  );
  if (document.meta.mode !== 'single' || !raw.pr_explanation) {
    throw new Error(`${dir}: expected a single-call answer, got mode ${document.meta.mode}`);
  }
  const output = JSON.parse(raw.pr_explanation);
  if (raw.flow_graph) output.flow = JSON.parse(raw.flow_graph);
  const { meta } = document;
  return {
    output,
    run: {
      provider: meta.provider,
      model: meta.model,
      generated_at: meta.generated_at,
      input_tokens: meta.usage.input_tokens,
      output_tokens: meta.usage.output_tokens,
    },
  };
}

const names = (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && (only.length === 0 || only.includes(entry.name)))
  .map((entry) => entry.name)
  .sort();

let failures = 0;
for (const name of names) {
  const dir = path.join(root, name);
  const sourceFile = path.join(dir, 'source.json');
  const source = JSON.parse(await readFile(sourceFile, 'utf8'));
  if (live) {
    const { output, run } = await liveAnswer(dir);
    await writeFile(path.join(dir, 'model-output.json'), `${JSON.stringify(output, null, 2)}\n`);
    source.run = run;
    await writeFile(sourceFile, `${JSON.stringify(source, null, 2)}\n`);
  }
  const { document, droppedRisks, warnings } = await replay(dir, source);

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
