/**
 * Per-hunk accept / reject of the document diff.
 *
 * A "hunk" is a maximal **contiguous run of changes** between the baseline
 * (`oldMd`) and the live doc (`newMd`) — a pure insert, a pure delete, or a
 * **replace** (deletes + inserts with no unchanged text between). Grouping the run
 * is load-bearing for correctness: a replace like "cat"→"dog" must be
 * accepted/rejected as ONE unit. Accepting only the insert half used to leave the
 * deleted "cat" in the baseline next to the new "dog" (→ "catdog"), which re-diffed
 * into a phantom change on the next pass — the "approved change comes back" bug.
 * As one hunk, accept swaps the whole span to the new text and it stops diffing
 * cleanly.
 *
 * All positions are over the ANCHOR-STRIPPED document (see stripAnchors), so
 * opening/closing a comment thread is never a change; reject rebuilds the WRAPPED
 * live doc so comment anchors ride along untouched.
 */
import { computeDiff } from './diff';
import { stripAnchors } from './threads';

/** A contiguous change between the two versions. */
export interface Hunk {
  index: number; // 0-based, document order (matches accept/reject's `k`)
  type: 'insert' | 'delete' | 'replace';
  oldValue: string; // baseline text removed ('' for a pure insert)
  newValue: string; // live text added ('' for a pure delete)
}

/** Either an unchanged span or a numbered change run. */
type Item =
  | { change: false; value: string }
  | { change: true; index: number; oldValue: string; newValue: string };

/**
 * Semantic-cleanup threshold (issue #53): a retained gap of at most this many
 * words sitting BETWEEN two changes is absorbed into a single replace, so a
 * rewritten sentence reads as one delete-old/insert-new rather than a scatter of
 * tiny word edits. Higher = coarser grouping. (Alternatives — sentence-level diff,
 * diff-match-patch cleanupSemantic — are parked on the issue.)
 */
const BRIDGE_WORDS = 3;

/** Word count of a span (whitespace-only → 0). */
function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Walk the word-diff, coalescing each contiguous run of changes into one item —
 * AND bridging short retained gaps (≤ {@link BRIDGE_WORDS}) between changes into
 * the same run (added to both sides, since the text is retained). The inline
 * decorations stay fine-grained; only the accept/reject *unit* is coarsened.
 */
function groupedDiff(oldMd: string, newMd: string): Item[] {
  const segs = computeDiff(oldMd, newMd);
  const items: Item[] = [];
  let k = -1;
  let cur: Extract<Item, { change: true }> | null = null;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.type === 'equal') {
      const next = segs[i + 1];
      // Bridge: mid-change, this gap is short, and another change follows → keep
      // the run open, absorbing the retained gap into both sides.
      if (cur && next && next.type !== 'equal' && wordCount(seg.value) <= BRIDGE_WORDS) {
        cur.oldValue += seg.value;
        cur.newValue += seg.value;
        continue;
      }
      if (cur) { items.push(cur); cur = null; }
      items.push({ change: false, value: seg.value });
    } else {
      if (!cur) cur = { change: true, index: ++k, oldValue: '', newValue: '' };
      if (seg.type === 'delete') cur.oldValue += seg.value;
      else cur.newValue += seg.value;
    }
  }
  if (cur) items.push(cur);
  return items;
}

/** Classify a change run from its two sides. */
function hunkType(oldValue: string, newValue: string): Hunk['type'] {
  if (oldValue && newValue) return 'replace';
  return newValue ? 'insert' : 'delete';
}

/**
 * The hunks a human is asked to accept/reject: the grouped word-diff of the
 * anchor-stripped bodies. Because anchors are stripped from both sides, opening or
 * closing a comment thread never registers as a hunk.
 */
export function listContentHunks(oldMd: string, newMd: string): Hunk[] {
  const hunks: Hunk[] = [];
  for (const it of groupedDiff(stripAnchors(oldMd), stripAnchors(newMd))) {
    if (it.change) {
      hunks.push({
        index: it.index,
        type: hunkType(it.oldValue, it.newValue),
        oldValue: it.oldValue,
        newValue: it.newValue,
      });
    }
  }
  return hunks;
}

/**
 * Accept hunk `k`: return the new baseline (anchor-stripped) with that hunk
 * applied — its span becomes the live text while every other span stays baseline —
 * so it stops diffing and the others don't. The baseline is only ever used for
 * diffing (always stripped first), so returning it stripped is exact; the live doc
 * and its anchors are untouched by accept.
 */
export function acceptHunk(oldMd: string, newMd: string, k: number): string {
  let out = '';
  for (const it of groupedDiff(stripAnchors(oldMd), stripAnchors(newMd))) {
    out += it.change ? (it.index === k ? it.newValue : it.oldValue) : it.value;
  }
  return out;
}

// --- Anchor-preserving reconstruction (reject) --------------------------------
// reject returns WRAPPED markdown (loaded back into the editor), but the diff is
// over the STRIPPED body. So we walk the grouped stripped diff while consuming the
// wrapped `newMd` in parallel: unchanged and kept-change spans are copied from the
// wrapped string (carrying any anchor scaffolding), and the rejected hunk's live
// text is swapped back to the baseline text.

const OPENER = [/^:mark\[/, /^:::mark\{#[^}]+\}\n/];
const CLOSER = [/^\]\{#[^}]+\}/, /^\n:::/];

function matchLen(res: RegExp[], w: string, i: number): number {
  const head = w.slice(i, i + 256);
  for (const re of res) {
    const m = re.exec(head);
    if (m) return m[0].length;
  }
  return 0;
}

/**
 * From wrapped `w` at `start`, consume exactly `count` STRIPPED characters,
 * returning the covered wrapped slice (with interleaved anchor scaffolding) and
 * the next index. Leading openers are pulled in while reaching content; trailing
 * closers are attached to the span just consumed — so an anchor stays whole.
 */
function takeStripped(w: string, start: number, count: number): { slice: string; end: number } {
  let i = start;
  let taken = 0;
  while (i < w.length && taken < count) {
    const open = matchLen(OPENER, w, i);
    if (open) { i += open; continue; }
    const close = matchLen(CLOSER, w, i);
    if (close) { i += close; continue; }
    i += 1;
    taken += 1;
  }
  let close: number;
  while ((close = matchLen(CLOSER, w, i)) > 0) i += close;
  return { slice: w.slice(start, i), end: i };
}

/**
 * Reject hunk `k`: return WRAPPED live markdown with that hunk reverted to the
 * baseline — its live text replaced by the baseline text — while every other hunk,
 * and every comment anchor, stays put.
 */
export function rejectHunk(oldMd: string, newMd: string, k: number): string {
  let out = '';
  let w = 0; // cursor into the wrapped newMd
  for (const it of groupedDiff(stripAnchors(oldMd), stripAnchors(newMd))) {
    if (!it.change) {
      const t = takeStripped(newMd, w, it.value.length);
      out += t.slice;
      w = t.end;
      continue;
    }
    // The change's newValue occupies the wrapped live; consume it either way.
    const t = takeStripped(newMd, w, it.newValue.length);
    w = t.end;
    out += it.index === k ? it.oldValue : t.slice; // revert to baseline, or keep live
  }
  out += newMd.slice(w);
  return out;
}
