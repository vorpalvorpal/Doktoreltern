import { describe, it, expect } from 'vitest';
import { listHunks, acceptHunk, rejectHunk } from '../src/hunks';
import { computeDiff } from '../src/diff';

// M2 Step 4 — per-hunk accept/reject of the body diff. Pure markdown transforms;
// the foot-region must be carried through untouched.

const OLD = 'the quick fox jumped over the lazy dog\n\n---\n\n<article data-thread="t1">x</article>';
const NEW = 'the quick brown fox jumped over the dog\n\n---\n\n<article data-thread="t1">x</article>';
// body diff: insert "brown " (hunk 0), delete "lazy " (hunk 1)

const bodyDiffEmpty = (a: string, b: string) =>
  computeDiff(a, b).every((s) => s.type === 'equal');

describe('hunks', () => {
  it('lists insert and delete hunks in order', () => {
    const hs = listHunks(OLD, NEW);
    expect(hs.map((h) => h.type)).toEqual(['insert', 'delete']);
    expect(hs[0].value).toContain('brown');
    expect(hs[1].value).toContain('lazy');
  });

  it('reject(insert) removes the inserted text from the live doc', () => {
    const out = rejectHunk(OLD, NEW, 0);
    expect(out).not.toContain('brown');
    // the other hunk (deletion of "lazy") is untouched: still absent in live
    expect(out).not.toContain('lazy');
    // foot-region preserved
    expect(out).toContain('<article data-thread="t1">x</article>');
  });

  it('reject(delete) restores the deleted text in the live doc', () => {
    const out = rejectHunk(OLD, NEW, 1);
    expect(out).toContain('lazy'); // restored
    expect(out).toContain('brown'); // the insert hunk stays accepted-as-is
    expect(out).toContain('<article data-thread="t1">x</article>');
  });

  it('accept(insert) advances the baseline so that hunk no longer diffs', () => {
    const newBaseline = acceptHunk(OLD, NEW, 0);
    expect(newBaseline).toContain('brown'); // baseline now has the insertion
    // diffing live vs the new baseline: the insert hunk is gone, delete remains
    const segs = computeDiff(newBaseline, NEW);
    const ins = segs.filter((s) => s.type === 'insert');
    const del = segs.filter((s) => s.type === 'delete');
    expect(ins.length).toBe(0);
    expect(del.map((s) => s.value).join('')).toContain('lazy');
  });

  it('accept(delete) advances the baseline so the deletion no longer diffs', () => {
    const newBaseline = acceptHunk(OLD, NEW, 1);
    expect(newBaseline).not.toContain('lazy'); // baseline no longer has it
    const segs = computeDiff(newBaseline, NEW);
    expect(segs.filter((s) => s.type === 'delete').length).toBe(0);
  });

  it('accepting every hunk makes the body diff empty', () => {
    const b1 = acceptHunk(OLD, NEW, 0);
    // after accepting hunk 0, re-list hunks against the new baseline and accept
    // the remaining one (now index 0).
    const remaining = listHunks(b1, NEW);
    expect(remaining.length).toBe(1);
    const b2 = acceptHunk(b1, NEW, remaining[0].index);
    expect(bodyDiffEmpty(b2, NEW)).toBe(true);
  });
});
