import { describe, expect, it } from 'vitest';
import { createRedactionCounter, redactText } from '../src/prepare/redact';

function redact(text: string, path?: string) {
  const counter = createRedactionCounter();
  const out = redactText(text, counter, path ? { path } : {});
  return { out, counter };
}

// Built at runtime so the test file itself does not look like it contains secrets.
const fake = {
  anthropic: 'sk-ant-api03-' + 'A'.repeat(30),
  openai: 'sk-proj-' + 'b1C2d3E4f5'.repeat(3),
  github: 'ghp_' + 'a1B2c3D4e5'.repeat(4),
  githubPat: 'github_pat_' + '11ABCDEFG0'.repeat(3),
  aws: 'AKIA' + 'ABCDEFGHIJKLMNOP',
  google: 'AIza' + 'Sy'.padEnd(35, 'x'),
  slack: 'xoxb-' + '1234567890-abcdefghij',
  stripe: 'sk_live_' + 'a1b2c3d4e5f6g7h8',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.' + 'dozjgNryP4J3jVmNHl0w5N',
};

describe('redactText', () => {
  it.each([
    ['anthropic-key', `const key = ${fake.anthropic};`],
    ['openai-key', `OPENAI=${fake.openai}`],
    ['github-token', `token: ${fake.github}`],
    ['github-token', `auth ${fake.githubPat}`],
    ['aws-access-key', `aws_access_key_id = ${fake.aws}`],
    ['google-api-key', `key=${fake.google}`],
    ['slack-token', `SLACK=${fake.slack}`],
    ['stripe-key', `stripe(${fake.stripe})`],
    ['jwt', `Authorization: Bearer ${fake.jwt}`],
  ])('redacts a %s', (kind, line) => {
    const { out, counter } = redact(line);
    expect(out).toContain(`[REDACTED:${kind}]`);
    expect(counter.byKind[kind]).toBe(1);
  });

  it('labels an Anthropic key as anthropic, not openai', () => {
    const { counter } = redact(fake.anthropic);
    expect(counter.byKind).toEqual({ 'anthropic-key': 1 });
  });

  it('redacts the password in a connection string but keeps the host', () => {
    const { out } = redact('DATABASE_URL=postgres://admin:hunter2pass@db.internal:5432/app');
    expect(out).toBe(
      'DATABASE_URL=postgres://admin:[REDACTED:url-credentials]@db.internal:5432/app',
    );
  });

  it('redacts quoted values assigned to secret-looking names', () => {
    const { out } = redact(
      'const config = { apiKey: "9f8e7d6c5b4a3210", password: \'Tr0ub4dor&3\' };',
    );
    expect(out).toBe(
      'const config = { apiKey: "[REDACTED:secret-assignment]", password: \'[REDACTED:secret-assignment]\' };',
    );
  });

  it('leaves code and placeholders alone', () => {
    const lines = [
      'const token = getToken();',
      'const apiKey = process.env.API_KEY;',
      'password: "changeme"',
      'secret = "${SECRET_FROM_VAULT}"',
      'api_key: "<your-api-key>"',
      'const tokenizer = new Tokenizer();',
      'git checkout -b feature/secret-rotation',
    ].join('\n');
    const { out, counter } = redact(lines);
    expect(out).toBe(lines);
    expect(counter.total).toBe(0);
  });

  it('leaves fake credentials from test fixtures alone', () => {
    // From sindresorhus/ky's tests and readme, which a live run redacted 22 times.
    const lines = [
      "const api = ky.create({ token: 'secret123' });",
      "const validToken = 'valid-token';",
      "headers: { token: 'valid:token' }",
      "headers: {'X-Auth-Token': 'original-token'}",
      'validToken = `fresh-token-${refreshCount}`;',
      'const token = `${prefix}${suffix}`;',
      'const clientSecret = "fakeClientSecret";',
      'password: "test-password-1"',
      'DATABASE_URL=postgres://user:test-password@localhost/app',
    ].join('\n');
    const { out, counter } = redact(lines);
    expect(out).toBe(lines);
    expect(counter.total).toBe(0);
  });

  it('redacts values with random parts even when they contain placeholder words', () => {
    const { counter } = redact(
      [
        'password = "mysecretpassword2024"',
        "token: 'secret-9f8e7d6c5b4a'",
        "apiKey: 'test-key-a8Kq2Zp7'",
        'token: `${prefix}-9f8e7d6c5b4a3210`',
      ].join('\n'),
    );
    expect(counter.byKind).toEqual({ 'secret-assignment': 4 });
  });

  it('redacts a private key block across lines and keeps the line count', () => {
    const key = [
      'const pem = `',
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gun',
      'VTLw7onLRnrq0/IzW7yWR7QkrmBL7jTKEn5u+qKhbwKfBstIs+bMY2Zkp18gnTxK',
      '-----END RSA PRIVATE KEY-----',
      '`;',
    ].join('\n');
    const { out, counter } = redact(key);
    expect(out.split('\n')).toHaveLength(6);
    expect(out).not.toContain('MIIEowIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gun');
    expect(out).toContain('-----END RSA PRIVATE KEY-----');
    expect(counter.byKind['private-key']).toBe(1);
  });

  it('redacts every value in a .env file but keeps the names', () => {
    const { out, counter } = redact(
      '# Database\nDB_HOST=localhost\nDB_PASSWORD="s3cr3t"\nexport PORT=3000\nEMPTY=\n',
      '.env.production',
    );
    expect(out).toBe(
      '# Database\nDB_HOST=[REDACTED:env-value]\nDB_PASSWORD=[REDACTED:env-value]\nexport PORT=[REDACTED:env-value]\nEMPTY=\n',
    );
    expect(counter.byKind['env-value']).toBe(3);
  });

  it('keeps placeholder values in .env.example files', () => {
    const text = 'API_URL=https://api.example.com\nAPI_KEY=\nDEBUG=false\n';
    expect(redact(text, 'config/.env.example').out).toBe(text);
  });

  it('never changes the number of lines', () => {
    const text = Array.from({ length: 50 }, (_, i) =>
      i % 7 === 0 ? `k${i} = "${fake.github}"` : `line ${i}`,
    ).join('\n');
    expect(redact(text).out.split('\n')).toHaveLength(50);
  });
});
