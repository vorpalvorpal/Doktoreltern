import { describe, it, expect } from 'vitest';
import { canonicalize, canonicalizeMilkdown } from '../../scripts/dl/canonical';
import { readFixture } from './helpers';

// Package A3 — the remark canonical engine (spike verdict: YES-WITH-GUARDS).
// The fixture corpus carries GUI escaping, so we canonicalise ONCE in setup and
// treat that as the canonical baseline the invariants must hold against.

const CORPUS = ['design.md', 'plan.md', 'torture.md'];

describe('canonicalize — idempotence (A3)', () => {
  for (const name of CORPUS) {
    it(`canonicalize(canonicalize(doc)) === canonicalize(doc): ${name}`, async () => {
      const once = await canonicalize(await readFixture(name));
      const twice = await canonicalize(once);
      expect(twice).toBe(once);
    });
  }
});

describe('canonicalize — GUI round-trip identity (A3, adjudicated 2026-07-10)', () => {
  // The DOM-free bet, corrected: Milkdown's escaping of `~`/`@` depends on
  // inline-mark structure earlier in the paragraph (serializer-state quirk,
  // Milkdown#704 family), so byte-exact milkdown(canon) === canon is
  // unattainable on real docs. The load-bearing invariant is round-trip
  // identity through the API boundary (plan C4 canonicalises every GUI save):
  // canonicalize(canonicalizeMilkdown(canon)) === canon.
  for (const name of ['design.md', 'plan.md']) {
    it(`canonicalize(canonicalizeMilkdown(canon)) === canon: ${name}`, async () => {
      const canon = await canonicalize(await readFixture(name));
      expect(await canonicalize(await canonicalizeMilkdown(canon))).toBe(canon);
    });
  }

  it('holds on the guard-clean torture doc', async () => {
    const canon = await canonicalize(await readFixture('torture.md'));
    expect(await canonicalize(await canonicalizeMilkdown(canon))).toBe(canon);
  });
});

describe('canonicalize — anchor preservation (A3)', () => {
  it('preserves an inline :mark[...] span byte-for-byte', async () => {
    const canon = await canonicalize(await readFixture('torture.md'));
    expect(canon).toContain(':mark[plain span]{#t2}');
  });

  it('preserves a :::mark container anchor', async () => {
    const canon = await canonicalize(await readFixture('torture.md'));
    expect(canon).toContain(':::mark{#t1}');
    expect(canon).toContain(':::');
  });
});

describe('canonicalize — list-spread normaliser (A3)', () => {
  it('canonicalises a tight bullet item carrying a nested sublist to loose', async () => {
    const md = '- parent\n  - child a\n  - child b\n- sibling\n';
    const out = await canonicalize(md);
    // Loose list => blank line between items.
    expect(out).toMatch(/parent[\s\S]*\n\n[\s\S]*sibling/);
  });

  it('leaves a plain tight bullet list of single-paragraph items tight', async () => {
    const md = '- one\n- two\n- three\n';
    const out = await canonicalize(md);
    expect(out).toBe('- one\n- two\n- three\n');
  });
});

describe('canonicalize — content-preservation guard (A3)', () => {
  it('throws (rather than silently corrupting) when normalisation would drop visible text', async () => {
    // The spike lists a bare `:mark` directive outside code as SWALLOWED by the
    // engine — i.e. visible text lost. The mdast-based content guard must catch
    // that and throw rather than return a doc missing the ":mark" prose.
    // (If the chosen remark config happens to preserve this, the implementer
    // should substitute another engine-divergent construct — see COVERAGE.md.)
    await expect(canonicalize('A bare :mark appears in prose.\n')).rejects.toThrow();
  });
});
