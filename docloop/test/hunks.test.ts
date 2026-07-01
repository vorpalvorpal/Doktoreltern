import { describe, it, expect } from 'vitest';
import { listContentHunks, acceptHunk, rejectHunk } from '../src/hunks';
import { computeDiff } from '../src/diff';

// Per-hunk accept/reject over the grouped word-diff. A hunk is a contiguous run of
// changes: insert, delete, or replace (old→new). Pure markdown transforms; comment
// anchors survive a reject.

const diffEmpty = (a: string, b: string) => computeDiff(a, b).every((s) => s.type === 'equal');

describe('listContentHunks (grouped)', () => {
  it('groups an adjacent delete+insert into one replace hunk', () => {
    const hs = listContentHunks('the cat sat', 'the dog sat');
    expect(hs).toEqual([{ index: 0, type: 'replace', oldValue: 'cat', newValue: 'dog' }]);
  });

  it('lists a pure insert and a pure delete when they are not adjacent', () => {
    const hs = listContentHunks('the quick fox jumped over the lazy dog', 'the quick brown fox jumped over the dog');
    expect(hs.map((h) => h.type)).toEqual(['insert', 'delete']);
    expect(hs[0].newValue).toContain('brown');
    expect(hs[1].oldValue).toContain('lazy');
  });

  it('bridges a SHORT retained gap into one replace (semantic cleanup)', () => {
    // "sat on the" (3 words) is retained between cat→dog and mat→rug → one replace.
    const hs = listContentHunks('the cat sat on the mat', 'the dog sat on the rug');
    expect(hs).toEqual([
      { index: 0, type: 'replace', oldValue: 'cat sat on the mat', newValue: 'dog sat on the rug' },
    ]);
  });

  it('does NOT bridge a LONG retained gap', () => {
    // "sat quietly over by the old" (6 words) > threshold → two separate replaces.
    const hs = listContentHunks('the cat sat quietly over by the old mat', 'the dog sat quietly over by the old rug');
    expect(hs.map((h) => h.type)).toEqual(['replace', 'replace']);
  });
});

describe('accept', () => {
  it('accepting a replace bakes the new text in — and it does NOT come back', () => {
    // Regression for the re-approval bug: accepting one side of a replace used to
    // merge old+new in the baseline ("catdog") and resurface as a phantom change.
    // Long gap so the two replaces stay separate (see bridging test above).
    const base = 'the cat sat quietly over by the old mat';
    const live = 'the dog sat quietly over by the old rug';
    const hunks = listContentHunks(base, live);
    expect(hunks.map((h) => h.type)).toEqual(['replace', 'replace']);

    const nb = acceptHunk(base, live, 0); // accept cat→dog
    expect(nb).toBe('the dog sat quietly over by the old mat'); // clean, no "catdog"
    const after = listContentHunks(nb, live);
    expect(after).toEqual([{ index: 0, type: 'replace', oldValue: 'mat', newValue: 'rug' }]);
  });

  it('accepting every hunk makes the diff empty', () => {
    const base = 'the cat sat quietly over by the old mat';
    const live = 'the dog sat quietly over by the old rug';
    let b = acceptHunk(base, live, 0);
    const rest = listContentHunks(b, live);
    b = acceptHunk(b, live, rest[0].index);
    expect(diffEmpty(b, live)).toBe(true);
  });
});

describe('reject', () => {
  it('reject(replace) swaps the span back to the baseline text', () => {
    const out = rejectHunk('the cat sat', 'the dog sat', 0);
    expect(out).toBe('the cat sat');
  });

  it('reject(insert) removes it; reject(delete) restores it', () => {
    const base = 'the quick fox jumped over the lazy dog';
    const live = 'the quick brown fox jumped over the dog';
    const hunks = listContentHunks(base, live); // [insert brown, delete lazy]
    const ins = hunks.find((h) => h.type === 'insert')!;
    const del = hunks.find((h) => h.type === 'delete')!;
    expect(rejectHunk(base, live, ins.index)).not.toContain('brown');
    expect(rejectHunk(base, live, del.index)).toContain('lazy');
  });
});

describe('anchors', () => {
  it('opening or closing a thread is not a hunk', () => {
    const plain = 'The quick fox.';
    const opened = 'The :mark[quick]{#t2} fox.';
    expect(listContentHunks(plain, opened)).toEqual([]);
    expect(listContentHunks(opened, plain)).toEqual([]);
  });

  it('reject preserves a nearby comment anchor (entangled edit)', () => {
    const base = 'The quick fox.';
    const live = 'The :mark[quick]{#t2} brown fox.'; // thread opened + "brown" inserted
    const hunks = listContentHunks(base, live);
    expect(hunks.map((h) => h.type)).toEqual(['insert']); // clean insert, no scaffolding
    const reverted = rejectHunk(base, live, hunks[0].index);
    expect(reverted).toBe('The :mark[quick]{#t2} fox.'); // brown gone, thread intact
  });

  it('reject(replace) next to an anchor keeps the anchor', () => {
    const base = 'A :mark[flag]{#t1} on the cat here.';
    const live = 'A :mark[flag]{#t1} on the dog here.';
    const hunks = listContentHunks(base, live);
    expect(hunks).toEqual([{ index: 0, type: 'replace', oldValue: 'cat', newValue: 'dog' }]);
    const reverted = rejectHunk(base, live, 0);
    expect(reverted).toContain(':mark[flag]{#t1}');
    expect(reverted).toContain('the cat here');
  });
});
