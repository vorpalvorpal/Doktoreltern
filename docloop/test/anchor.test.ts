import { describe, it, expect, afterEach } from 'vitest';
import { getMarkdown } from '@milkdown/utils';
import { TextSelection } from '@milkdown/prose/state';
import { createEditor, type DocloopEditor } from '../src/editor';
import { commentAnchorMark } from '../src/anchor';
import { findMarkHighlights } from '../src/decorations';

// Phase 1 — the directive anchor (src/anchor.ts) replaces the raw-HTML <mark>.
// These pin the same two properties comment-mark.test.ts pinned for <mark>:
//   1. round-trip to byte-clean `:mark[…]{#id}` through the editor's serializer,
//   2. survive text typed INSIDE the anchor (id rides with the span) — and now
//      additionally that inner formatting is preserved (the <mark> serializer
//      dropped it).

let ed: DocloopEditor | null = null;
afterEach(async () => {
  await ed?.destroy();
  ed = null;
});

function anchorRange(d: DocloopEditor) {
  const hl = findMarkHighlights(d.view.state.doc);
  expect(hl.length).toBe(1);
  return hl[0];
}

describe('commentAnchor directive', () => {
  it('parses :mark[…]{#id} into the schema mark and serialises it back byte-clean', async () => {
    const md = 'A sentence with a :mark[commented span]{#t1} in it.';
    ed = await createEditor(document.createElement('div'), md, { editable: true });

    const range = anchorRange(ed);
    expect(range.id).toBe('t1');
    expect(ed.view.state.doc.textBetween(range.from, range.to)).toBe('commented span');

    const out = ed.editor.action(getMarkdown());
    expect(out).toContain(':mark[commented span]{#t1}');
  });

  it('survives text typed INSIDE the anchor (id stays glued to the edited span)', async () => {
    const md = 'A :mark[span]{#t1} here.';
    ed = await createEditor(document.createElement('div'), md, { editable: true });

    const before = anchorRange(ed);
    const at = before.from + 2; // sp|an
    const tr = ed.view.state.tr
      .setSelection(TextSelection.create(ed.view.state.doc, at))
      .insertText('X', at);
    ed.view.dispatch(tr);

    const after = anchorRange(ed);
    expect(after.id).toBe('t1');
    expect(ed.view.state.doc.textBetween(after.from, after.to)).toBe('spXan');

    const out = ed.editor.action(getMarkdown());
    expect(out).toContain(':mark[spXan]{#t1}');
  });

  it('preserves inline formatting inside the anchor (the <mark> serializer dropped it)', async () => {
    const md = 'A :mark[**bold** span]{#t1} here.';
    ed = await createEditor(document.createElement('div'), md, { editable: true });
    const out = ed.editor.action(getMarkdown());
    expect(out).toContain('**bold**'); // kept
    expect(out).not.toContain('**:mark'); // and nested INSIDE, not outside
    expect(out).toContain('{#t1}');
  });

  it('exposes the MarkType via commentAnchorMark.type(ctx) for the write UI', async () => {
    ed = await createEditor(document.createElement('div'), 'plain text', { editable: true });
    expect(commentAnchorMark.type(ed.editor.ctx).name).toBe('commentAnchor');
  });
});
