/**
 * The change-review model, built on the editor's **text content** (not the
 * markdown string) so every change maps to a ProseMirror position — which lets
 * the GUI place an accept/reject card in the margin *beside* the change, exactly
 * like a comment. This replaces the old markdown-string hunk model.
 *
 * A **change** is a contiguous run of edits between the baseline doc and the live
 * doc — insert, delete, or replace (old→new) — with short retained gaps bridged
 * into one run (issue #53, opt 1) so a rewritten sentence reads as one change.
 *
 * Accept and reject (see main.ts):
 *   - **accept** = mark reviewed and hide it. The change is already in the live
 *     doc; nothing is written. On the next commit the baseline advances to that
 *     commit and the change is simply gone — so behaviour across a commit is
 *     unchanged from the old "advance the baseline" model.
 *   - **reject** = {@link rejectChange}: a ProseMirror edit that swaps the live
 *     span back to the baseline text. Surrounding marks (formatting) are inherited;
 *     comment anchors ride along because PM handles them.
 *
 * Limitation (v0): a *formatting-only* edit (bold added, text unchanged) is not a
 * text-content change, so it isn't surfaced. Word/prose edits — the common case —
 * are. (The markdown model caught these but couldn't be positioned.)
 */
import type { Node as PMNode } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { buildBodyTextIndex } from './decorations';
import { groupedDiff } from './grouped-diff';

/** A positioned change between the baseline and the live doc. */
export interface Change {
  /** content-based identity, stable across re-renders for the accept-hide set */
  key: string;
  index: number; // 0-based, document order
  type: 'insert' | 'delete' | 'replace';
  oldValue: string; // baseline text removed ('' for a pure insert)
  newValue: string; // live text added ('' for a pure delete)
  /** PM positions of the change in the LIVE doc (from === to for a pure delete) */
  from: number;
  to: number;
}

/**
 * The changes between `oldDoc` (baseline) and `newDoc` (live), each with its
 * PM position in the live doc so a card can be placed beside it. Diffing the
 * docs' text content means markdown punctuation and comment scaffolding never
 * register as changes.
 */
export function listChanges(oldDoc: PMNode, newDoc: PMNode): Change[] {
  const newIdx = buildBodyTextIndex(newDoc);
  const oldText = buildBodyTextIndex(oldDoc).text;

  const changes: Change[] = [];
  const occ = new Map<string, number>(); // per-signature counter for stable keys
  let cursor = 0; // offset into newIdx.text
  let index = 0;
  for (const it of groupedDiff(oldText, newIdx.text)) {
    if (!it.change) {
      cursor += it.value.length;
      continue;
    }
    const from = newIdx.posAt(cursor);
    const to = newIdx.posAt(cursor + it.newValue.length);
    const type: Change['type'] = it.oldValue && it.newValue ? 'replace' : it.newValue ? 'insert' : 'delete';
    const sig = `${type}${it.oldValue}${it.newValue}`;
    const n = occ.get(sig) ?? 0;
    occ.set(sig, n + 1);
    changes.push({ key: `${sig}${n}`, index: index++, type, oldValue: it.oldValue, newValue: it.newValue, from, to });
    cursor += it.newValue.length;
  }
  return changes;
}

/**
 * Reject a change: edit the live doc so its span returns to the baseline text.
 *   - insert (oldValue '') → delete the span;
 *   - delete (from === to) → re-insert the removed text;
 *   - replace → swap the new text for the old.
 * The restored text inherits the formatting marks at `from` (minus the comment
 * anchor, which shouldn't cling to reverted baseline text).
 */
export function rejectChange(view: EditorView, change: Change): void {
  const { from, to, oldValue } = change;
  const { state } = view;
  if (!oldValue) {
    view.dispatch(state.tr.delete(from, to));
    return;
  }
  const marks = state.doc.resolve(from).marks().filter((m) => m.type.name !== 'commentAnchor');
  const node = state.schema.text(oldValue, marks);
  view.dispatch(state.tr.replaceRangeWith(from, to, node));
}
