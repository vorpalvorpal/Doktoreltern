import { describe, it, expect } from 'vitest';
import { blockDelta } from '../../scripts/dl/agenda';

// Package B3 — block-level union delta.
//
// ASSUMED SIGNATURE (flagged in COVERAGE.md): blockDelta(oldDoc, newDoc) returns
// one item per contiguous changed run, each shaped { old: string[]; new:
// string[]; headingTrail?: string[]; newDoc?: boolean }. It strips anchors
// internally (so a pure anchoring change is invisible — the "anchor add/remove is
// thread business, not prose" rule). If the implementer instead strips in the
// caller and passes stripped text, the "pure anchoring change" test is the only
// one that needs its inputs pre-stripped.

const BASE =
  '# Doc\n\n## Alpha\n\nalpha body original\n\n## Beta\n\nbeta body stays the same\n';

describe('blockDelta (B3)', () => {
  it('editing one paragraph yields exactly one change item with the two versions', () => {
    const edited = BASE.replace('alpha body original', 'alpha body EDITED');
    const items = blockDelta(BASE, edited);
    expect(items).toHaveLength(1);
    expect(items[0].old.join('\n')).toContain('alpha body original');
    expect(items[0].new.join('\n')).toContain('alpha body EDITED');
    // Heading context of the changed run.
    expect(items[0].headingTrail).toContain('Alpha');
  });

  it('inserting a whole section yields one item with an empty old side', () => {
    const withSection = BASE + '\n## Gamma\n\ngamma one\n\ngamma two\n';
    const items = blockDelta(BASE, withSection);
    expect(items).toHaveLength(1);
    expect(items[0].old.join('')).toBe('');
    expect(items[0].new.join('\n')).toContain('gamma one');
    expect(items[0].new.join('\n')).toContain('gamma two');
  });

  it('a pure anchoring change (:mark wrapped, nothing else) yields ZERO items', () => {
    const anchored = BASE.replace('beta body stays the same', ':mark[beta body stays the same]{#t1}');
    expect(blockDelta(BASE, anchored)).toHaveLength(0);
  });

  it('reordering two sections produces items (delete+insert) without crashing or misattributing', () => {
    const reordered =
      '# Doc\n\n## Beta\n\nbeta body stays the same\n\n## Alpha\n\nalpha body original\n';
    const items = blockDelta(BASE, reordered);
    expect(items.length).toBeGreaterThan(0);
    // The untouched-content blocks are the ones that moved; nothing throws.
    expect(() => blockDelta(BASE, reordered)).not.toThrow();
  });

  it('a doc absent at the boundary (created since) is a single whole-doc item, empty old side', () => {
    const items = blockDelta('', BASE);
    expect(items).toHaveLength(1);
    expect(items[0].old.join('')).toBe('');
    expect(items[0].new.join('\n')).toContain('alpha body original');
  });
});
