import { describe, it, expect } from 'vitest';
import {
  fingerprint,
  saveDraft,
  loadDraft,
  clearDraft,
  type DraftStorage,
} from '../src/draft-store';

/**
 * A minimal in-memory Storage double — the whole point of injecting DraftStorage
 * is that this logic is testable without a `window`/`localStorage` global. Mirrors
 * the store tests' "fresh isolated backing per test" style.
 */
function fakeStorage(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const DOC = 'plan.md';

describe('fingerprint', () => {
  it('is deterministic and identical for identical content', () => {
    expect(fingerprint('hello world')).toBe(fingerprint('hello world'));
  });

  it('differs for different content (incl. small edits)', () => {
    expect(fingerprint('hello world')).not.toBe(fingerprint('hello  world'));
    expect(fingerprint('hello world')).not.toBe(fingerprint('hello worlD'));
    expect(fingerprint('')).not.toBe(fingerprint('a'));
  });
});

describe('saveDraft / loadDraft round-trip', () => {
  it('restores an edit made on top of the current server doc', () => {
    const s = fakeStorage();
    const base = '# Title\n\nbody';
    const edit = '# Title\n\nbody EDITED';
    saveDraft(s, DOC, base, edit);
    // Server current is unchanged since the edit -> the draft is offered back.
    expect(loadDraft(s, DOC, base)).toBe(edit);
  });

  it('keys drafts per doc name (no cross-doc contamination)', () => {
    const s = fakeStorage();
    saveDraft(s, 'plan.md', 'P', 'P-edited');
    saveDraft(s, 'design.md', 'D', 'D-edited');
    expect(loadDraft(s, 'plan.md', 'P')).toBe('P-edited');
    expect(loadDraft(s, 'design.md', 'D')).toBe('D-edited');
  });
});

describe('saveDraft no-op when nothing is unsaved', () => {
  it('does not store a draft equal to its base, and clears a prior one', () => {
    const s = fakeStorage();
    saveDraft(s, DOC, 'base', 'edited'); // a real draft exists
    expect(loadDraft(s, DOC, 'base')).toBe('edited');
    saveDraft(s, DOC, 'base', 'base'); // user reverted their edit back to base
    expect(loadDraft(s, DOC, 'base')).toBeNull();
    expect(s.map.size).toBe(0); // the stale record was actively removed
  });
});

describe('loadDraft staleness + emptiness guards', () => {
  it('returns null when there is no stored draft', () => {
    expect(loadDraft(fakeStorage(), DOC, 'anything')).toBeNull();
  });

  it('returns null when the base moved (a new server current, e.g. Claude committed)', () => {
    const s = fakeStorage();
    saveDraft(s, DOC, 'v1-base', 'v1-base + my edit');
    // Server now serves a different doc (a new turn landed) -> draft is stale,
    // restoring it would clobber the new turn.
    expect(loadDraft(s, DOC, 'v2-different-base')).toBeNull();
  });

  it('returns null when the draft equals the current server doc (nothing differs)', () => {
    const s = fakeStorage();
    // Force a stored record whose draft happens to equal the server current but
    // whose base matches too (degenerate: an edit that was then also committed).
    saveDraft(s, DOC, 'base', 'same');
    expect(loadDraft(s, DOC, 'same')).toBeNull();
  });

  it('returns null on a malformed / non-JSON stored value', () => {
    const s = fakeStorage();
    s.setItem('docloop:draft:plan.md', 'not json{');
    expect(loadDraft(s, DOC, 'base')).toBeNull();
  });

  it('returns null on a JSON value missing required fields', () => {
    const s = fakeStorage();
    s.setItem('docloop:draft:plan.md', JSON.stringify({ draft: 'x' })); // no base
    expect(loadDraft(s, DOC, 'base')).toBeNull();
  });
});

describe('clearDraft', () => {
  it('removes a stored draft so it is no longer offered', () => {
    const s = fakeStorage();
    saveDraft(s, DOC, 'base', 'edited');
    clearDraft(s, DOC);
    expect(loadDraft(s, DOC, 'base')).toBeNull();
    expect(s.map.size).toBe(0);
  });
});
