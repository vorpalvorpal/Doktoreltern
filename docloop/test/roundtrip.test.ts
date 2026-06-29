import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { roundTrip } from '../src/roundtrip';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, 'fixtures', 'roundtrip.md'), 'utf8');

// M0 — the make-or-break gate. These assertions ARE the pass/fail criteria.
// Do not loosen them to go green: if a tag can't survive, that's a real FAIL.
describe('M0 — Milkdown markdown round-trip (gate)', () => {
  it('is idempotent — stable fixpoint after the first normalisation', async () => {
    const once = await roundTrip(fixture);
    const twice = await roundTrip(once);
    expect(twice).toBe(once);
  });

  it('does not over-escape standard markdown (no spurious backslashes)', async () => {
    const out = await roundTrip(fixture);
    // the prosemirror-markdown failure mode rjs hit: *em* -> \*em\*
    expect(out).not.toMatch(/\\[*_[\]`]/);
    expect(out).toContain('[link](https://example.com)');
    expect(out).toMatch(/\*emphasis\*|_emphasis_/);
  });

  it('preserves the :mark comment-anchor directive with its id', async () => {
    const out = await roundTrip(fixture);
    expect(out).toContain(':mark[commented span]{#t1}');
  });

  it('preserves the <ins>/<del> diff tags as raw HTML', async () => {
    const out = await roundTrip(fixture);
    expect(out).toContain('<ins>an inserted span</ins>');
    expect(out).toContain('<del>a deleted span</del>');
  });

  it('preserves the <article> foot-region thread with its attribute', async () => {
    const out = await roundTrip(fixture);
    expect(out).toContain('<article data-thread="t1">');
    expect(out).toContain('</article>');
  });
});
