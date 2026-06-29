import { describe, it, expect, afterEach } from 'vitest';
import { TextSelection } from '@milkdown/prose/state';
import { createEditor, type DocloopEditor } from '../src/editor';
import {
  applyAnchor,
  removeAnchor,
  currentMarkdown,
  loadMarkdown,
  hasTextSelection,
} from '../src/write-actions';
import { acceptHunk, rejectHunk, listContentHunks } from '../src/hunks';
import { findMarkHighlights } from '../src/decorations';
import { OLD_MD, NEW_MD } from '../src/sample';

// M2 Step 3/4 — exercise the DOCUMENT-side action paths the GUI buttons call,
// against a real headless editor loaded with the real sample doc. Comment bodies
// live in the sidecar store (covered by threads-store.test.ts); these tests cover
// the anchor + hunk operations on the document itself.

let ed: DocloopEditor | null = null;
afterEach(async () => {
  await ed?.destroy();
  ed = null;
});

/** Select the doc text matching `needle` (first occurrence) in the live doc. */
function selectText(d: DocloopEditor, needle: string): void {
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
  const sel = TextSelection.create(doc, found, found + needle.length);
  d.view.dispatch(d.view.state.tr.setSelection(sel));
}

describe('write actions (document side)', () => {
  it('applyAnchor: marks the selection and round-trips, leaving other anchors alone', async () => {
    ed = await createEditor(document.createElement('div'), NEW_MD, { editable: true });

    // No selection -> no-op.
    expect(hasTextSelection(ed)).toBe(false);
    expect(applyAnchor(ed, 't2')).toBe(false);

    // Select "quick" and anchor a new thread on it.
    selectText(ed, 'quick');
    expect(hasTextSelection(ed)).toBe(true);
    expect(applyAnchor(ed, 't2')).toBe(true);

    // The new anchor exists in the doc as a schema mark over "quick"...
    const mine = findMarkHighlights(ed.view.state.doc).find((m) => m.id === 't2');
    expect(mine).toBeTruthy();
    expect(ed.view.state.doc.textBetween(mine!.from, mine!.to)).toBe('quick');

    // ...and the markdown carries the directive, byte-clean and idempotent.
    const md = currentMarkdown(ed);
    expect(md).toContain(':mark[quick]{#t2}');
    expect(md).toContain(':mark[questionable claim]{#t1}'); // pre-existing untouched

    loadMarkdown(ed, md);
    expect(currentMarkdown(ed)).toBe(md); // reload is a fixpoint (no drift)
  });

  it('removeAnchor: unwraps the anchor back to plain text', async () => {
    ed = await createEditor(document.createElement('div'), NEW_MD, { editable: true });
    removeAnchor(ed, 't1');
    const md = currentMarkdown(ed);
    expect(md).not.toContain('{#t1}'); // anchor directive gone
    expect(md).toContain('questionable claim'); // span survives as plain text
    expect(findMarkHighlights(ed.view.state.doc).length).toBe(0);
  });

  it('Reject hunk: reverts the inserted word in the live doc, anchors intact', async () => {
    ed = await createEditor(document.createElement('div'), NEW_MD, { editable: true });
    // baseline OLD_MD vs live NEW_MD: insert "brown" (hunk 0), delete "lazy" (hunk 1)
    const md0 = currentMarkdown(ed);
    const insHunk = listContentHunks(OLD_MD, md0).find((h) => h.type === 'insert')!;
    const reverted = rejectHunk(OLD_MD, md0, insHunk.index);
    loadMarkdown(ed, reverted);
    expect(currentMarkdown(ed)).not.toContain('brown'); // insertion reverted
    expect(currentMarkdown(ed)).toContain(':mark[questionable claim]{#t1}'); // anchor survives
  });

  it('Accept hunk: advances the baseline so it stops diffing, others remain', async () => {
    ed = await createEditor(document.createElement('div'), NEW_MD, { editable: true });
    const live = currentMarkdown(ed);
    let baseline = OLD_MD;
    const insHunk = listContentHunks(baseline, live).find((h) => h.type === 'insert')!;
    baseline = acceptHunk(baseline, live, insHunk.index);
    const remaining = listContentHunks(baseline, live);
    expect(remaining.some((h) => h.type === 'insert')).toBe(false);
    expect(remaining.some((h) => h.type === 'delete')).toBe(true);
    expect(currentMarkdown(ed)).toBe(live); // live doc unchanged by accept
  });
});
