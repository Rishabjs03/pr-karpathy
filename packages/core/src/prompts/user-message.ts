/**
 * Builds the user message: the PR metadata, file list, numbered diff, and file contents.
 *
 * Every section is wrapped in an XML-style tag. The system prompt tells the model that the
 * contents of these tags are data, which is the first line of defense against instructions
 * hidden in a PR description or a code comment.
 */
import type { FileContents, PullRequestInfo } from '../changeset';
import { describeFile, formatFileContent, formatFileDiff } from '../diff/format';
import type { DiffFile } from '../diff/types';
import { clampText } from '../postprocess/text';
import type { SkippedFile, Source } from '../schema/document';

export interface UserPromptInput {
  source: Source;
  pr: PullRequestInfo | null;
  /** Files to explain in this call. */
  files: readonly DiffFile[];
  skipped: readonly SkippedFile[];
  /** Contents to include, keyed by path, already filtered to fit the token budget. */
  contents: ReadonlyMap<string, Partial<FileContents>>;
  /** For batched calls: every file in the PR, so the model knows what exists elsewhere. */
  otherFiles?: readonly DiffFile[];
}

const SKIP_REASONS: Record<SkippedFile['reason'], string> = {
  ignored: 'matches the ignore list',
  binary: 'binary file',
  generated: 'generated file',
  'too-large': 'too large to include',
};

/** Longest PR description we send. Long descriptions are usually templates or logs. */
const MAX_DESCRIPTION = 6000;

function pullRequestSection(source: Source, pr: PullRequestInfo | null): string {
  const lines: string[] = [];
  if (pr?.title) lines.push(`Title: ${pr.title}`);
  if (source.repository) lines.push(`Repository: ${source.repository}`);
  if (source.head_ref && source.base_ref)
    lines.push(`Branches: ${source.head_ref} into ${source.base_ref}`);
  if (source.author) lines.push(`Author: ${source.author}`);
  if (pr?.description?.trim()) {
    lines.push('Description:', clampText(pr.description, MAX_DESCRIPTION));
  }
  if (lines.length === 0) {
    lines.push(
      source.kind === 'git'
        ? `No pull request metadata. The input is the local git range ${source.label}.`
        : 'No pull request metadata. The input is a raw diff.',
    );
  }
  return `<pull_request>\n${lines.join('\n')}\n</pull_request>`;
}

function contentsSection(contents: UserPromptInput['contents']): string | null {
  const blocks: string[] = [];
  for (const [path, entry] of contents) {
    if (entry.head) {
      blocks.push(`<file path="${path}" version="new">\n${formatFileContent(entry.head)}\n</file>`);
    }
    if (entry.base) {
      blocks.push(`<file path="${path}" version="old">\n${formatFileContent(entry.base)}\n</file>`);
    }
  }
  return blocks.length > 0 ? `<file_contents>\n${blocks.join('\n\n')}\n</file_contents>` : null;
}

/** Builds the user message for an explainer call (single or batched). */
export function buildUserPrompt(input: UserPromptInput): string {
  const sections = [pullRequestSection(input.source, input.pr)];

  sections.push(
    `<changed_files>\n${input.files.map((file) => `- ${describeFile(file)}`).join('\n')}\n</changed_files>`,
  );
  if (input.otherFiles && input.otherFiles.length > 0) {
    sections.push(
      `<other_files_in_this_pr>\nThese files are part of the same PR but are explained in another batch. Do not describe them, but you may mention how the files above connect to them.\n${input.otherFiles.map((file) => `- ${describeFile(file)}`).join('\n')}\n</other_files_in_this_pr>`,
    );
  }
  if (input.skipped.length > 0) {
    sections.push(
      `<skipped_files>\n${input.skipped.map((file) => `- ${file.file} (${SKIP_REASONS[file.reason]})`).join('\n')}\n</skipped_files>`,
    );
  }
  sections.push(`<diff>\n${input.files.map(formatFileDiff).join('\n\n')}\n</diff>`);
  const contents = contentsSection(input.contents);
  if (contents) sections.push(contents);

  return sections.join('\n\n');
}
