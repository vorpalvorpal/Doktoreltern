import { describe, it, expect, afterEach } from 'vitest';
import { TextSelection } from '@milkdown/prose/state';
import { createEditor, type DocloopEditor } from '../../src/editor';
import { applyAnchor, currentMarkdown, snapSelection } from '../../src/write-actions';
import { stripAnchors } from '../../src/threads';

// Package D — snapSelection + the applyAnchor guard rail. jsdom editor tests,
// pattern of test/write-actions.test.ts. snapSelection is a planned new export of
// src/write-actions.ts.

let ed: DocloopEditor | null = null;
afterEach(async () => {
  await ed?.destroy();
  ed = null;
});

/** Absolute positions of the first occurrence of `needle` in the flattened doc. */
function rangeOf(d: DocloopEditor, needle: string): { from: number; to: number } {
  const doc = d.view.state.doc;
  let found = -1;
  doc.descendants((n, pos) => {
    if (found >= 0) return false;
    if (n.isText && n.text) {
      const i = n.text.indexOf(needle);
      if (i >= 0) found = pos + i;
    }
    return true;
  });
  if (found < 0) throw new Error(`text not found: ${needle}`);
  return { from: found, to: found + needle.length };
}

function select(d: DocloopEditor, from: number, to: number): void {
  d.view.dispatch(d.view.state.tr.setSelection(TextSelection.create(d.view.state.doc, from, to)));
}

function countIds(md: string, id: string): number {
  return (md.match(new RegExp(`\\{#${id}\\}`, 'g')) ?? []).length;
}

describe('snapSelection — word snapping (D1)', () => {
  it('a mid-word selection anchors whole words: exactly one :mark[word and more]', async () => {
    ed = await createEditor(document.createElement('div'), 'here is word and more of it.\n', { editable: true });
    const { from, to } = rangeOf(ed, 'rd and mo'); // starts inside "word", ends inside "more"
    select(ed, from, to);
    expect(applyAnchor(ed, 't2')).toBe(true);

    const md = currentMarkdown(ed);
    expect(md).toContain(':mark[word and more]{#t2}');
    expect(countIds(md, 't2')).toBe(1);
    // Visible text unchanged (anchoring never edits content).
    expect(stripAnchors(md)).toBe('here is word and more of it.\n');
  });

  it('trims leading/trailing whitespace out of the anchored span', async () => {
    ed = await createEditor(document.createElement('div'), 'word one two end\n', { editable: true });
    const { from, to } = rangeOf(ed, ' one '); // includes surrounding spaces
    select(ed, from, to);
    applyAnchor(ed, 't2');

    const md = currentMarkdown(ed);
    expect(md).toContain(':mark[one]{#t2}');
    expect(md).not.toContain(':mark[ one'); // no leading space captured
    expect(md).not.toContain('one ]{#t2}'); // no trailing space captured
  });

  it('returns null for a whitespace-only selection (applyAnchor becomes a no-op)', async () => {
    ed = await createEditor(document.createElement('div'), 'alpha   beta\n', { editable: true });
    const { from, to } = rangeOf(ed, '   '); // the run of spaces only
    const snapped = snapSelection(ed.view.state, from, to);
    expect(snapped).toBeNull();

    const before = currentMarkdown(ed);
    select(ed, from, to);
    expect(applyAnchor(ed, 't2')).toBe(false);
    expect(currentMarkdown(ed)).toBe(before); // byte-identical
  });
});

describe('snapSelection — inline-code snapping (D1)', () => {
  it('a boundary inside an inline-code span extends to cover the whole span, staying one directive', async () => {
    ed = await createEditor(document.createElement('div'), 'text with `code span` after\n', { editable: true });
    const { from } = rangeOf(ed, 'with ');
    const mid = rangeOf(ed, 'code'); // land the end boundary inside the code span
    select(ed, from, mid.from + 2);
    applyAnchor(ed, 't2');

    const md = currentMarkdown(ed);
    expect(countIds(md, 't2')).toBe(1); // never splits the code span into two directives
    expect(stripAnchors(md)).toContain('`code span`'); // code span intact
  });
});

describe('multi-block selection → container anchor (D2)', () => {
  it('a selection spanning two paragraphs becomes one :::mark container, zero inline :mark', async () => {
    ed = await createEditor(
      document.createElement('div'),
      'first paragraph here.\n\nsecond paragraph here.\n',
      { editable: true },
    );
    const a = rangeOf(ed, 'paragraph here.'); // in the first paragraph
    const b = rangeOf(ed, 'second'); // in the second paragraph
    select(ed, a.from, b.to);
    applyAnchor(ed, 't2');

    const md = currentMarkdown(ed);
    expect(md).toContain(':::mark{#t2}');
    expect(md).not.toContain(':mark[' ); // no inline fragment for a cross-block selection
    expect(countIds(md, 't2')).toBe(1);
    // Visible text preserved across the wrap.
    expect(stripAnchors(md)).toBe('first paragraph here.\n\nsecond paragraph here.\n');
  });
});

describe('single-block behaviour unchanged (D)', () => {
  it('a clean word-aligned single-paragraph selection produces the same inline directive as before', async () => {
    ed = await createEditor(document.createElement('div'), 'the quick brown fox\n', { editable: true });
    const { from, to } = rangeOf(ed, 'quick');
    select(ed, from, to);
    applyAnchor(ed, 't2');
    const md = currentMarkdown(ed);
    expect(md).toContain(':mark[quick]{#t2}');
    expect(countIds(md, 't2')).toBe(1);
  });
});
