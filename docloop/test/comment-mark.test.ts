import { describe, it, expect, afterEach } from 'vitest';
import { getMarkdown } from '@milkdown/utils';
import { TextSelection } from '@milkdown/prose/state';
import { createEditor, type DocloopEditor } from '../src/editor';
import { commentAnchorMark } from '../src/comment-mark';
import { findMarkHighlights } from '../src/decorations';

// M2 Step 1 — the "road bump" proof. The comment anchor is now a ProseMirror
// schema mark (src/comment-mark.ts), not the M1 raw-html-node pairs. These tests
// pin the two things the old approach could not do:
//   1. serialise the mark back to byte-clean `<mark data-thread="id">…</mark>`
//      (so the M0 gate stays satisfiable on the editor path), and
//   2. survive text inserted *inside* the anchor — the open/close stay wrapped
//      around the edited text.

let ed: DocloopEditor | null = null;
afterEach(async () => {
  await ed?.destroy();
  ed = null;
});

/** Locate the single commentAnchor run in the live doc as a {from,to,id}. */
function anchorRange(d: DocloopEditor) {
  const hl = findMarkHighlights(d.view.state.doc);
  expect(hl.length).toBe(1);
  return hl[0];
}

describe('commentAnchor schema mark', () => {
  it('parses <mark data-thread> into a schema mark and serialises it back byte-clean', async () => {
    const md = 'A sentence with a <mark data-thread="t1">commented span</mark> in it.';
    ed = await createEditor(document.createElement('div'), md, { editable: true });

    // It is a real mark on the text node, not an html atom.
    const range = anchorRange(ed);
    expect(range.id).toBe('t1');
    expect(ed.view.state.doc.textBetween(range.from, range.to)).toBe('commented span');

    // ...and round-trips through the editor's own serializer exactly.
    const out = ed.editor.action(getMarkdown());
    expect(out).toContain('<mark data-thread="t1">commented span</mark>');
  });

  it('survives text typed INSIDE the anchor (the M1 html-node approach failed this)', async () => {
    const md = 'A <mark data-thread="t1">span</mark> here.';
    ed = await createEditor(document.createElement('div'), md, { editable: true });

    const before = anchorRange(ed);
    // Insert "X" two chars into the anchor ("sp|an"). Use a selection so the
    // inclusive mark applies, matching what typing in the UI does.
    const at = before.from + 2;
    const tr = ed.view.state.tr
      .setSelection(TextSelection.create(ed.view.state.doc, at))
      .insertText('X', at);
    ed.view.dispatch(tr);

    // The anchor still wraps exactly the edited text — and nothing leaked out.
    const after = anchorRange(ed);
    expect(after.id).toBe('t1');
    expect(ed.view.state.doc.textBetween(after.from, after.to)).toBe('spXan');

    const out = ed.editor.action(getMarkdown());
    expect(out).toContain('<mark data-thread="t1">spXan</mark>');
    // crucially: still ONE pair of tags, not desynced open/close atoms.
    expect((out.match(/<mark /g) ?? []).length).toBe(1);
    expect((out.match(/<\/mark>/g) ?? []).length).toBe(1);
  });

  it('exposes the MarkType via commentAnchorMark.type(ctx) for the write UI', async () => {
    ed = await createEditor(document.createElement('div'), 'plain text', { editable: true });
    const markType = commentAnchorMark.type(ed.editor.ctx);
    expect(markType.name).toBe('commentAnchor');
  });
});
