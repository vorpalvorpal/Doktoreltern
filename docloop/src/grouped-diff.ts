/**
 * Group a word-diff into contiguous change runs, bridging short retained gaps
 * between changes into the same run so a rewrite reads as one delete-old/
 * insert-new rather than a scatter of tiny edits (issue #53, opt 1).
 *
 * Extracted from src/changes.ts (the PM-positioned change-review model) so the
 * same grouping can run on plain strings — src/turn.ts's edit rendering wants
 * the identical coarsening for the same reason changes.ts wanted it for the
 * margin cards, but has no ProseMirror doc to position against.
 */
import { computeDiff } from './diff';

/** ≤ this many retained words between two changes are bridged into one (issue #53). */
export const BRIDGE_WORDS = 3;

export function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Either an unchanged span or a change run, over a plain text string. */
export type Item =
  | { change: false; value: string }
  | { change: true; oldValue: string; newValue: string };

/**
 * Group the word-diff into contiguous change runs, bridging short retained gaps
 * (≤ {@link BRIDGE_WORDS}) between changes into the same run so a rewrite reads as
 * one delete-old/insert-new rather than a scatter of tiny edits.
 */
export function groupedDiff(oldText: string, newText: string): Item[] {
  const segs = computeDiff(oldText, newText);
  const items: Item[] = [];
  let cur: Extract<Item, { change: true }> | null = null;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.type === 'equal') {
      const next = segs[i + 1];
      if (cur && next && next.type !== 'equal' && wordCount(seg.value) <= BRIDGE_WORDS) {
        cur.oldValue += seg.value; // retained gap — belongs to both sides
        cur.newValue += seg.value;
        continue;
      }
      if (cur) { items.push(cur); cur = null; }
      items.push({ change: false, value: seg.value });
    } else {
      if (!cur) cur = { change: true, oldValue: '', newValue: '' };
      if (seg.type === 'delete') cur.oldValue += seg.value;
      else cur.newValue += seg.value;
    }
  }
  if (cur) items.push(cur);
  return items;
}
