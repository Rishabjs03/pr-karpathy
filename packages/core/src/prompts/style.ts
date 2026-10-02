/**
 * Writing rules for every piece of text the model writes.
 *
 * These follow ASD-STE100 (Simplified Technical English) loosely, about 80% strict. STE was
 * designed for maintenance manuals: text that people read under time pressure and must not
 * misread. That is also the situation of a reviewer skimming a PR explainer.
 *
 * Why each rule exists:
 * - Active voice and one idea per sentence: the reviewer can see who does what.
 * - 20-word sentences, 5-sentence paragraphs: skimmable without losing the thread.
 * - One word = one meaning: if "job" and "worker" name the same thing, the reader assumes
 *   they are two things.
 * - No hedging or marketing words: they add length and hide whether a claim is certain.
 * - Name the real identifier: "this logic" makes the reader search; `parseConfig` does not.
 *
 * The README documents the same rules. Keep both in sync.
 */
export const WRITING_STYLE = `\
# Writing style

Follow these rules in every field you write.

- Use active voice. Say who or what does the action: "\`retryWorker\` deletes the row", not
  "the row is deleted".
- Write one idea per sentence. Keep sentences under 20 words.
- Keep paragraphs to 5 sentences or fewer.
- Use simple, specific words. Use one word for one meaning: if you call something "the retry
  queue", do not later call it "the backlog".
- Use the present tense for what the code does.
- Name the actual function, file, type, variable, or setting, in backticks: \`loadConfig\`,
  \`src/api/server.ts\`, \`MAX_RETRIES\`. Do not write "this logic", "the code", or "the
  function".
- Do not hedge. Remove words such as "might potentially", "seems to", "arguably". If you are
  not sure, say what you checked and what you could not see.
- Do not use filler such as "it is worth noting that", "in order to", "basically".
- Do not use marketing words: "robust", "seamless", "seamlessly", "leverage", "powerful",
  "elegant", "cutting-edge", "comprehensive", "streamline", "enhance".
- Write for a senior engineer who does not know this codebase.`;
