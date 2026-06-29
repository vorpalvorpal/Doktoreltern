import { describe, it, expect } from 'vitest';
import { listHunks, listContentHunks, acceptHunk, rejectHunk } from '../src/hunks';
import { computeDiff } from '../src/diff';

// M2 Step 4 — per-hunk accept/reject of the document word-diff. Pure markdown
// transforms over the whole document (there is no foot-region any more).

const OLD = 'the quick fox jumped over the lazy dog';
const NEW = 'the quick brown fox jumped over the dog';
// diff: insert "brown " (hunk 0), delete "lazy " (hunk 1)

const diffEmpty = (a: string, b: string) =>
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
  });

  it('reject(delete) restores the deleted text in the live doc', () => {
    const out = rejectHunk(OLD, NEW, 1);
    expect(out).toContain('lazy'); // restored
    expect(out).toContain('brown'); // the insert hunk stays accepted-as-is
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

  it('opening or closing a thread is not an approvable change', () => {
    const plain = 'The quick fox jumped over the dog.';
    const opened = 'The :mark[quick]{#t2} fox jumped over the dog.';
    // Raw hunks see the scaffolding; content hunks (stripped diff) do not.
    expect(listHunks(plain, opened).length).toBeGreaterThan(0);
    expect(listContentHunks(plain, opened)).toEqual([]);
    // Closing (resolve) is likewise invisible to the Changes panel.
    expect(listContentHunks(opened, plain)).toEqual([]);
  });

  it('a content edit alongside an existing thread is approvable, anchor preserved on reject', () => {
    const baseline = 'The :mark[quick]{#t2} fox jumped over the dog.';
    const live = 'The :mark[quick]{#t2} fox jumped over the big dog.';
    const content = listContentHunks(baseline, live);
    expect(content.some((h) => h.value.includes('big'))).toBe(true);
    const reverted = rejectHunk(baseline, live, content.find((h) => h.value.includes('big'))!.index);
    expect(reverted).not.toContain('big');
    expect(reverted).toContain(':mark[quick]{#t2}'); // thread untouched
  });

  it('rejects an edit landing RIGHT against an anchor without disturbing it (entangled case)', () => {
    // A thread is opened on "quick" AND "brown" inserted next to it, same turn.
    const baseline = 'The quick fox jumped over the dog.';
    const live = 'The :mark[quick]{#t2} brown fox jumped over the dog.';
    const content = listContentHunks(baseline, live);
    // The stripped diff sees a clean "brown" insert — no scaffolding bundled in.
    expect(content.map((h) => h.value.trim())).toEqual(['brown']);
    // Rejecting it removes "brown" but leaves the freshly-opened thread intact.
    const reverted = rejectHunk(baseline, live, content[0].index);
    expect(reverted).toBe('The :mark[quick]{#t2} fox jumped over the dog.');
  });

  it('rejecting a deletion restores plain text next to an untouched anchor', () => {
    const baseline = 'The :mark[quick]{#t2} brown fox jumped over the lazy dog.';
    const live = 'The :mark[quick]{#t2} fox jumped over the dog.'; // brown + lazy deleted
    const content = listContentHunks(baseline, live);
    const lazyHunk = content.find((h) => h.value.includes('lazy'))!;
    const reverted = rejectHunk(baseline, live, lazyHunk.index);
    expect(reverted).toContain('lazy'); // deletion restored
    expect(reverted).toContain(':mark[quick]{#t2}'); // anchor intact
    expect(reverted).not.toContain('brown'); // the other deletion stays
  });

  it('accepting every hunk makes the diff empty', () => {
    const b1 = acceptHunk(OLD, NEW, 0);
    // after accepting hunk 0, re-list hunks against the new baseline and accept
    // the remaining one (now index 0).
    const remaining = listHunks(b1, NEW);
    expect(remaining.length).toBe(1);
    const b2 = acceptHunk(b1, NEW, remaining[0].index);
    expect(diffEmpty(b2, NEW)).toBe(true);
  });
});
