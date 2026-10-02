import { describe, expect, it } from 'vitest';
import { normalizePrUrl, prFileUrl, prLineUrl } from '../src/links';

const PR = 'https://github.com/acme/api/pull/42';
// sha256("src/a.ts")
const ANCHOR = 'diff-072fc23b941d05af2383888f292b78e406e0e82a4a3f8ee698113dd9bcc79e5f';

describe('GitHub links', () => {
  it('normalizes PR sub-pages to the base PR URL', () => {
    expect(normalizePrUrl(`${PR}/files`)).toBe(PR);
    expect(normalizePrUrl(`${PR}/commits/abc123`)).toBe(PR);
    expect(normalizePrUrl('https://github.com/acme/api')).toBeNull();
  });

  it('builds file anchors from the sha256 of the path', () => {
    const url = prFileUrl(PR, 'src/a.ts');
    expect(url).toMatch(/^https:\/\/github\.com\/acme\/api\/pull\/42\/files#diff-[0-9a-f]{64}$/);
  });

  it('uses R for new lines and L for old lines', () => {
    expect(prLineUrl(PR, 'src/a.ts', 'new', [3, 9])).toMatch(/R3-R9$/);
    expect(prLineUrl(PR, 'src/a.ts', 'old', [3, 3])).toMatch(/L3$/);
  });

  it('returns null without a PR URL', () => {
    expect(prFileUrl(null, 'src/a.ts')).toBeNull();
    expect(prLineUrl(null, 'src/a.ts', 'new', [1, 2])).toBeNull();
  });

  it('matches the anchor format GitHub uses', () => {
    expect(prFileUrl(PR, 'src/a.ts')).toBe(`${PR}/files#${ANCHOR}`);
  });
});
