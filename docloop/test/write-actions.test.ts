import { describe, it, expect, afterEach } from 'vitest';
import { TextSelection } from '@milkdown/prose/state';
import { createEditor, type DocloopEditor } from '../src/editor';
import {
  addComment,
  reply,
  resolve,
  currentMarkdown,
  loadMarkdown,
  hasTextSelection,
} from '../src/write-actions';
import { acceptHunk, rejectHunk, listHunks } from '../src/hunks';
import { findMarkHighlights } from '../src/decorations';
import { extractThreads } from '../src/threads';
import { OLD_MD, NEW_MD } from '../src/sample';

// M2 Step 3/4 — exercise the exact action paths the GUI buttons call, against a
// real headless editor loaded with the real sample doc. This is the integration
// proof behind `npm run dev`: add comment / reply / resolve / accept / reject all
// go through the M0 serialise -> foot transform -> reload round-trip.

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

describe('write actions (GUI integration)', () => {
  it('Add comment: anchors a NEW thread on the selection and round-trips', async () => {
    ed = await createEditor(document.createElement('div'), NEW_MD, { editable: true });

    // No selection -> disabled / no-op.
    expect(hasTextSelection(ed)).toBe(false);
    expect(addComment(ed)).toBeNull();

    // Select "quick" and comment on it.
    selectText(ed, 'quick');
    expect(hasTextSelection(ed)).toBe(true);
    const id = addComment(ed, 'is this the right adjective?');
    expect(id).not.toBeNull();

    // The new anchor exists in the doc as a schema mark over "quick"...
    const marks = findMarkHighlights(ed.view.state.doc);
    const mine = marks.find((m) => m.id === id);
    expect(mine).toBeTruthy();
    expect(ed.view.state.doc.textBetween(mine!.from, mine!.to)).toBe('quick');

    // ...and the markdown has both the anchor directive and the new <article>,
    // byte-clean, and STILL round-trips (idempotent reload).
    const md = currentMarkdown(ed);
    expect(md).toContain(`:mark[quick]{#${id}}`);
    expect(md).toContain(`<article data-thread="${id}">is this the right adjective?</article>`);
    // the pre-existing t1 thread is untouched
    expect(md).toContain(':mark[questionable claim]{#t1}');

    // reload is a fixpoint (no drift): load it again and re-serialise.
    loadMarkdown(ed, md);
    expect(currentMarkdown(ed)).toBe(md);
  });

  it('Reply: appends to an existing thread (br-joined), original kept', async () => {
    ed = await createEditor(document.createElement('div'), NEW_MD, { editable: true });
    reply(ed, 't1', 'and another point');
    const md = currentMarkdown(ed);
    const body = extractThreads(md).find((t) => t.id === 't1')?.body ?? '';
    expect(body).toContain('field log'); // original reply preserved
    expect(body).toContain('and another point'); // new reply appended
    expect(body).toContain('<br>'); // br-joined
  });

  it('Resolve: unwraps the anchor mark AND deletes the article', async () => {
    ed = await createEditor(document.createElement('div'), NEW_MD, { editable: true });
    resolve(ed, 't1');
    const md = currentMarkdown(ed);
    expect(md).not.toContain('data-thread="t1"'); // mark + article both gone
    expect(md).toContain('questionable claim'); // anchor text survives as plain text
    expect(findMarkHighlights(ed.view.state.doc).length).toBe(0);
  });

  it('Reject hunk: reverts the inserted word in the live doc', async () => {
    ed = await createEditor(document.createElement('div'), NEW_MD, { editable: true });
    // baseline OLD_MD vs live NEW_MD: insert "brown" (hunk 0), delete "lazy" (hunk 1)
    const md0 = currentMarkdown(ed);
    const hunks = listHunks(OLD_MD, md0);
    const insHunk = hunks.find((h) => h.type === 'insert')!;
    const reverted = rejectHunk(OLD_MD, md0, insHunk.index);
    loadMarkdown(ed, reverted);
    expect(currentMarkdown(ed)).not.toContain('brown'); // insertion reverted
    // anchors and threads survive a hunk reject (foot-region carried through)
    expect(currentMarkdown(ed)).toContain(':mark[questionable claim]{#t1}');
  });

  it('Accept hunk: advances the baseline so it stops diffing, others remain', async () => {
    ed = await createEditor(document.createElement('div'), NEW_MD, { editable: true });
    const live = currentMarkdown(ed);
    let baseline = OLD_MD;
    const insHunk = listHunks(baseline, live).find((h) => h.type === 'insert')!;
    baseline = acceptHunk(baseline, live, insHunk.index);
    const remaining = listHunks(baseline, live);
    // the insert is no longer a hunk; the delete remains
    expect(remaining.some((h) => h.type === 'insert')).toBe(false);
    expect(remaining.some((h) => h.type === 'delete')).toBe(true);
    // live doc is unchanged by accept
    expect(currentMarkdown(ed)).toBe(live);
  });
});
