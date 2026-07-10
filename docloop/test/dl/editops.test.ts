import { describe, it, expect } from 'vitest';
import { parseEditOps, applyEditOps } from '../../scripts/dl/editops';
import { splitBlocks } from '../../scripts/dl/blocks';

// Package A6 — the pure op layer behind `dl edit`.
//
// ASSUMED SIGNATURES (flagged in COVERAGE.md — the plan specifies the stdin
// grammar and behaviour but not the module's function names):
//   parseEditOps(stdin): EditOp[]                         — throws on bad/ambiguous input
//   applyEditOps(source, ops): { text, shift }            — validates, applies bottom-up
// The `shift` shape is likewise assumed: an array of { from, delta } cumulative
// breakpoints. If the implementer picks a different representation, only the
// shift assertions need re-expressing; the behavioural claims stand.

const DOC = '# Doc\n\npara one\n\npara two\n\npara three\n\npara four\n';

/** Resolve the reported shift for an untouched old ordinal. */
function shiftFor(shift: Array<{ from: number; delta: number }>, ordinal: number): number {
  let d = 0;
  for (const s of shift) if (ordinal >= s.from) d = s.delta;
  return d;
}

describe('parseEditOps — grammar (A6)', () => {
  it('parses a multi-op batch (replace / insert-after / delete)', () => {
    const ops = parseEditOps(
      '@@ replace 4-5\nnew body line\n\n@@ insert-after 9\nadded\n\n@@ delete 12\n',
    );
    expect(ops).toHaveLength(3);
  });

  it('treats insert-after 0 as an insert at the very top', () => {
    const ops = parseEditOps('@@ insert-after 0\nprepended\n');
    expect(ops[0]).toMatchObject({ kind: 'insert-after', n: 0 });
  });

  it('hard-errors before any work when a body line itself matches an op header', () => {
    expect(() => parseEditOps('@@ replace 2\n@@ delete 3\n')).toThrow(/ambiguous body/i);
  });

  it('hard-errors even when the preceding op already captured real body content (not just the empty-body case)', () => {
    expect(() =>
      parseEditOps('@@ replace 2\nreal content\n@@ replace 3\nmore content\n'),
    ).toThrow(/ambiguous body/i);
  });

  it('trims trailing blank lines from a body', () => {
    const ops = parseEditOps('@@ replace 2\nkept\n\n\n');
    expect(ops[0]).toMatchObject({ kind: 'replace', body: 'kept' });
  });
});

describe('applyEditOps — validation (A6)', () => {
  it('rejects overlapping targets (replace 3-5 + delete 4) and does not mutate source', () => {
    const ops = parseEditOps('@@ replace 3-5\nx\n\n@@ delete 4\n');
    expect(() => applyEditOps(DOC, ops)).toThrow(/overlap/i);
  });

  it('rejects two inserts at the same point', () => {
    const ops = parseEditOps('@@ insert-after 2\na\n\n@@ insert-after 2\nb\n');
    expect(() => applyEditOps(DOC, ops)).toThrow();
  });

  it('rejects an out-of-range ordinal', () => {
    const ops = parseEditOps('@@ delete 99\n');
    expect(() => applyEditOps(DOC, ops)).toThrow();
  });
});

describe('applyEditOps — bottom-up application against the ORIGINAL numbering (A6)', () => {
  it('multi-op batch given ascending applies as if bottom-up (ordinals refer to original ref)', () => {
    // Blocks: 1=# Doc, 2=para one, 3=para two, 4=para three, 5=para four.
    const ops = parseEditOps('@@ replace 2\nONE\n\n@@ delete 4\n\n@@ insert-after 5\nFIVE\n');
    const { text } = applyEditOps(DOC, ops);
    expect(text).toContain('ONE'); // para one replaced
    expect(text).not.toContain('para three'); // block 4 deleted
    expect(text).toContain('para two'); // block 3 untouched
    expect(text).toContain('FIVE'); // appended after original block 5
  });

  it('a single equal-count replace reports no shift', () => {
    const { shift } = applyEditOps(DOC, parseEditOps('@@ replace 3\nreplacement\n'));
    expect(shift.every((s) => s.delta === 0) || shift.length === 0).toBe(true);
  });

  it('insert-after 0 prepends the body as the new first block', () => {
    const { text } = applyEditOps(DOC, parseEditOps('@@ insert-after 0\nPREPENDED intro\n'));
    const blocks = splitBlocks(text);
    expect(blocks[0].segment).toContain('PREPENDED intro');
    expect(blocks[1].segment).toContain('# Doc');
  });
});

describe('applyEditOps — shift map property (A6)', () => {
  it('every untouched old ordinal + reported shift = its ordinal in splitBlocks(new)', () => {
    // delete block 4 (para three): everything >=5 shifts by -1.
    const { text, shift } = applyEditOps(DOC, parseEditOps('@@ delete 4\n'));
    const oldBlocks = splitBlocks(DOC);
    const newBlocks = splitBlocks(text);
    for (const b of oldBlocks) {
      if (b.segment.includes('para three')) continue; // deleted
      const moved = newBlocks.find((nb) => nb.segment.trim() === b.segment.trim());
      expect(moved).toBeTruthy();
      expect(b.n + shiftFor(shift, b.n)).toBe(moved!.n);
    }
  });
});
