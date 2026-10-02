/**
 * Secret redaction: runs before any text leaves the machine.
 *
 * Every diff line, file content, and PR description goes through `redactText` before it is
 * sent to the model. Matches are replaced with `[REDACTED:<kind>]`. Replacement never adds
 * or removes lines, so line numbers in the diff stay valid for risk citations.
 *
 * This is a best-effort filter, not a guarantee. It looks for well-known token formats,
 * private key blocks, credentials in URLs, secret-looking assignments, and values in `.env`
 * files. The README says so, and tells users which provider receives their code.
 */

interface SecretPattern {
  kind: string;
  pattern: RegExp;
  /** Index of the capture group to replace. 0 (default) replaces the whole match. */
  group?: number;
}

/**
 * Patterns for secrets with a recognizable format. Order matters: more specific patterns run
 * first, so an Anthropic key is labeled `anthropic-key`, not `openai-key`.
 */
const SECRET_PATTERNS: readonly SecretPattern[] = [
  { kind: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: 'openai-key', pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g },
  {
    kind: 'github-token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g,
  },
  { kind: 'gitlab-token', pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'aws-access-key', pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g },
  { kind: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'slack-token', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'slack-webhook', pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}/g },
  { kind: 'stripe-key', pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { kind: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { kind: 'sendgrid-key', pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g },
  { kind: 'twilio-key', pattern: /\bSK[0-9a-f]{32}\b/g },
  {
    kind: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  },
  // Credentials inside a URL: scheme://user:password@host
  {
    kind: 'url-credentials',
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"`]+:([^\s/@'"`]+)@/gi,
    group: 1,
  },
  // A quoted value assigned to a secret-looking name: apiKey = "..." or "password": "..."
  {
    kind: 'secret-assignment',
    pattern:
      /\b[\w.-]*(?:api[_-]?key|secret|token|passw(?:or)?d|pwd|credential|private[_-]?key|access[_-]?key|auth[_-]?key|client[_-]?secret)[\w.-]*["']?\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/gi,
    group: 1,
  },
];

/** Values that look like secrets by name but are clearly placeholders. */
const PLACEHOLDER =
  /^(?:x+|\*+|\.+|<[^>]*>|\$\{[^}]*\}|\{\{[^}]*\}\}|your[_-].*|changeme|example.*|placeholder|redacted|test|dummy|secret|password|null|none|undefined|true|false)$/i;

const PRIVATE_KEY_BEGIN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/;
const PRIVATE_KEY_END = /-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/;

/** Files whose values are secrets by convention. Example files are left to the patterns. */
const ENV_FILE = /(?:^|\/)\.env(?:\.[\w-]+)?$/;
const ENV_EXAMPLE = /\.(?:example|sample|template|dist|defaults?)$/i;
/** KEY=value lines; the value is group 2. */
const ENV_ASSIGNMENT = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=\s*)(.+?)\s*$/;

export interface RedactionCounter {
  total: number;
  byKind: Record<string, number>;
}

export function createRedactionCounter(): RedactionCounter {
  return { total: 0, byKind: {} };
}

function count(counter: RedactionCounter, kind: string): void {
  counter.total += 1;
  counter.byKind[kind] = (counter.byKind[kind] ?? 0) + 1;
}

const marker = (kind: string) => `[REDACTED:${kind}]`;

/** Redacts secrets in one line of text. */
export function redactLine(line: string, counter: RedactionCounter): string {
  let out = line;
  for (const { kind, pattern, group = 0 } of SECRET_PATTERNS) {
    out = out.replace(pattern, (match: string, ...rest: unknown[]) => {
      if (group === 0) {
        count(counter, kind);
        return marker(kind);
      }
      const value = rest[group - 1];
      if (typeof value !== 'string' || PLACEHOLDER.test(value) || value.startsWith('[REDACTED')) {
        return match;
      }
      count(counter, kind);
      return match.replace(value, marker(kind));
    });
  }
  return out;
}

export interface RedactOptions {
  /** Path of the file the text belongs to. Enables `.env` handling. */
  path?: string;
}

/** True when a path is a `.env` file whose values should all be redacted. */
export function isEnvFile(path: string): boolean {
  return ENV_FILE.test(path) && !ENV_EXAMPLE.test(path);
}

/**
 * Redacts lines one at a time, remembering whether it is inside a private key block, since
 * those span many lines. Use one instance per file (or per diff hunk).
 */
export class LineRedactor {
  private inPrivateKey = false;

  constructor(
    private readonly counter: RedactionCounter,
    private readonly envFile = false,
  ) {}

  redact(line: string): string {
    if (this.inPrivateKey) {
      if (PRIVATE_KEY_END.test(line)) this.inPrivateKey = false;
      return line.replace(/[A-Za-z0-9+/=]{8,}/g, marker('private-key'));
    }
    if (PRIVATE_KEY_BEGIN.test(line)) {
      count(this.counter, 'private-key');
      if (!PRIVATE_KEY_END.test(line)) this.inPrivateKey = true;
      return line.replace(
        /(-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----).*$/,
        `$1 ${marker('private-key')}`,
      );
    }
    if (this.envFile && !line.trimStart().startsWith('#')) {
      const match = ENV_ASSIGNMENT.exec(line);
      const value = match?.[2]?.replace(/^["']|["']$/g, '');
      if (match && value && !PLACEHOLDER.test(value)) {
        count(this.counter, 'env-value');
        return `${match[1]}${marker('env-value')}`;
      }
    }
    return redactLine(line, this.counter);
  }
}

/**
 * Redacts secrets in a block of text, line by line, keeping the line count unchanged.
 *
 * @param text - The text to redact.
 * @param counter - Collects the number of redactions by kind.
 * @param options - `path` enables `.env` file handling.
 */
export function redactText(
  text: string,
  counter: RedactionCounter,
  options: RedactOptions = {},
): string {
  const redactor = new LineRedactor(counter, options.path ? isEnvFile(options.path) : false);
  return text
    .split('\n')
    .map((line) => redactor.redact(line))
    .join('\n');
}
