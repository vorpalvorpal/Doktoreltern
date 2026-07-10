import { describe, it, expect } from 'vitest';
import { splitBlocks, sectionRange } from '../../scripts/dl/blocks';
import { readFixture } from './helpers';

// Package A1 — the block model. The load-bearing property is the tiling
// invariant (segments.join('') === source); every read/edit correctness claim
// rests on it, so it is tested hardest.

const REAL_DOCS = ['design.md', 'plan.md'];

describe('splitBlocks — tiling invariant (A1)', () => {
  for (const name of REAL_DOCS) {
    it(`segments tile back to the exact source: ${name}`, async () => {
      const src = await readFixture(name);
      const blocks = splitBlocks(src);
      expect(blocks.map((b) => b.segment).join('')).toBe(src);
    });
  }

  it('segments tile back to the exact source: synthetic torture doc', async () => {
    const src = await readFixture('torture.md');
    const blocks = splitBlocks(src);
    expect(blocks.map((b) => b.segment).join('')).toBe(src);
  });

  it('blocks are numbered 1..N in order', async () => {
    const blocks = splitBlocks(await readFixture('torture.md'));
    expect(blocks.map((b) => b.n)).toEqual(blocks.map((_, i) => i + 1));
  });
});

describe('splitBlocks — node granularity (A1)', () => {
  it('a :::mark container wrapping two paragraphs is exactly one block', async () => {
    const blocks = splitBlocks(await readFixture('torture.md'));
    const container = blocks.filter((b) => b.segment.includes(':::mark{#t1}'));
    expect(container).toHaveLength(1);
    expect(container[0].segment).toContain('First wrapped paragraph');
    expect(container[0].segment).toContain('Second wrapped paragraph');
    expect(container[0].segment).toContain(':::');
  });

  it('a 3-item bullet list yields 3 blocks, nested sub-list riding inside its parent item', async () => {
    const md = '# H\n\n- first item\n- second item:\n  - nested a\n  - nested b\n- third item\n';
    const blocks = splitBlocks(md);
    const items = blocks.filter((b) => /^- /m.test(b.segment) && !b.segment.startsWith('#'));
    expect(items).toHaveLength(3);
    // The nested sub-list is content of the second item's block, not its own blocks.
    const second = items.find((b) => b.segment.includes('second item'));
    expect(second!.segment).toContain('nested a');
    expect(second!.segment).toContain('nested b');
    // "nested a" must not surface as a top-level block of its own.
    expect(blocks.filter((b) => b.segment.trimStart().startsWith('- nested a'))).toHaveLength(0);
  });

  it('a fence containing "- fake item" and "# fake heading" is a single block', async () => {
    const blocks = splitBlocks(await readFixture('torture.md'));
    const fence = blocks.filter((b) => b.segment.includes('# fake heading'));
    expect(fence).toHaveLength(1);
    expect(fence[0].segment).toContain('- fake item');
    expect(fence[0].segment).toContain('@@ 3 @@');
  });

  it('a GFM table is one block', async () => {
    const blocks = splitBlocks(await readFixture('torture.md'));
    const table = blocks.filter((b) => b.segment.includes('| a | b |'));
    expect(table).toHaveLength(1);
    expect(table[0].segment).toContain('| 1 | 2 |');
  });
});

describe('splitBlocks — degenerate docs (A1)', () => {
  it('an empty doc yields no blocks', () => {
    expect(splitBlocks('')).toEqual([]);
  });

  it('a one-paragraph doc yields one block whose segment is the whole source', () => {
    const src = 'just one paragraph, nothing else\n';
    const blocks = splitBlocks(src);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].segment).toBe(src);
  });
});

describe('splitBlocks — heading trail (A1)', () => {
  it('records the enclosing heading trail, outermost first', () => {
    const md = '# Top\n\nintro\n\n## Sub\n\nbody under sub\n';
    const blocks = splitBlocks(md);
    const body = blocks.find((b) => b.segment.includes('body under sub'))!;
    expect(body.headingTrail).toEqual(['Top', 'Sub']);
  });

  it('a depth-3 heading pops the trail back to depth 2 before pushing itself', () => {
    const md = '# A\n\n## B\n\ntext b\n\n## C\n\n### D\n\ntext d\n';
    const blocks = splitBlocks(md);
    const td = blocks.find((b) => b.segment.includes('text d'))!;
    expect(td.headingTrail).toEqual(['A', 'C', 'D']);
  });
});

describe('sectionRange (A1)', () => {
  it('returns the heading block through the block before the next same-or-shallower heading', () => {
    const md = '# Doc\n\n## Goals\n\ngoal one\n\ngoal two\n\n## Other\n\nother body\n';
    const blocks = splitBlocks(md);
    const { from, to } = sectionRange(blocks, 'Goals');
    const slice = blocks.slice(from - 1, to).map((b) => b.segment).join('');
    expect(slice).toContain('## Goals');
    expect(slice).toContain('goal one');
    expect(slice).toContain('goal two');
    expect(slice).not.toContain('## Other');
    expect(slice).not.toContain('other body');
  });

  it('matches heading text case-insensitively', () => {
    const md = '# Doc\n\n## Goals\n\nbody\n';
    const blocks = splitBlocks(md);
    expect(() => sectionRange(blocks, 'goals')).not.toThrow();
  });

  it('throws listing available headings for an unknown section', () => {
    const md = '# Doc\n\n## Goals\n\nbody\n';
    const blocks = splitBlocks(md);
    expect(() => sectionRange(blocks, 'Nonexistent')).toThrow(/Goals/);
  });

  it('throws naming both ordinals for duplicate heading text', () => {
    const md = '# Doc\n\n## Repeat\n\na\n\n## Repeat\n\nb\n';
    const blocks = splitBlocks(md);
    expect(() => sectionRange(blocks, 'Repeat')).toThrow(/ambiguous|duplicate|2/i);
  });
});
