/**
 * Per-hunk accept / reject of the body diff (M2 Step 4 — minimal).
 *
 * A "hunk" is a single insert-or-delete segment of the body word-diff between the
 * baseline (`oldMd`) and the live doc (`newMd`) — exactly the segments
 * `computeDiff` returns, numbered in document order (0-based). The read view
 * draws one decoration per hunk; these helpers let the user resolve one at a
 * time.
 *
 * Both operations are pure markdown→markdown string transforms over the whole
 * document (there is no longer a foot-region — threads live in the sidecar store).
 * They reconstruct the text by walking the diff segments and choosing, per hunk,
 * the old or new side — the same equal/insert/delete vocabulary diff.ts pins.
 *
 *   - **reject(k)** reverts hunk k in the *live* doc: the inserted text is
 *     dropped, or the deleted text is restored — so that span returns to the
 *     baseline while every other hunk stays as Claude left it. Returns the new
 *     live markdown.
 *   - **accept(k)** bakes hunk k into the *baseline*: the inserted text is added
 *     to the baseline, or the deleted text is removed from it — so that hunk no
 *     longer diffs while the others still do. Returns the new baseline markdown.
 *
 * Driving accept by advancing the baseline (rather than hiding a decoration)
 * keeps the "doc is the source of truth" model intact: the live doc never
 * changes on accept (the text is already what the user wants), and the diff
 * simply stops flagging that span on the next re-derive.
 */
import { computeDiff, type DiffSegment } from './diff';
import { stripAnchors } from './threads';

/** The hunks in a body diff, with their kind, for building UI controls. */
export interface Hunk {
  index: number; // 0-based, document order (matches accept/reject's `k`)
  type: 'insert' | 'delete';
  value: string;
}

/** List the insert/delete hunks of the body diff, numbered in order. */
export function listHunks(oldMd: string, newMd: string): Hunk[] {
  const hunks: Hunk[] = [];
  let k = 0;
  for (const seg of computeDiff(oldMd, newMd)) {
    if (seg.type === 'equal') continue;
    hunks.push({ index: k, type: seg.type, value: seg.value });
    k += 1;
  }
  return hunks;
}

/**
 * The hunks a human is asked to accept/reject: the word-diff of the **anchor-
 * stripped** bodies. Because anchors are removed from both sides before diffing,
 * opening or closing a comment thread never registers as a hunk (and there is no
 * scaffolding left to bundle into a content hunk — the entangled-edit case is
 * gone). This matches the turn render and the inline decorations, both of which
 * also diff the stripped body. {@link acceptHunk} / {@link rejectHunk} use the
 * same stripped numbering, so an index from here addresses the right segment.
 */
export function listContentHunks(oldMd: string, newMd: string): Hunk[] {
  return listHunks(stripAnchors(oldMd), stripAnchors(newMd));
}

/** Iterate diff segments, tagging each insert/delete with its 0-based hunk index. */
function withHunkIndex(
  oldMd: string,
  newMd: string,
): Array<DiffSegment & { hunk: number }> {
  let k = -1;
  return computeDiff(oldMd, newMd).map((seg) => {
    if (seg.type !== 'equal') k += 1;
    return { ...seg, hunk: seg.type === 'equal' ? -1 : k };
  });
}

// --- Anchor-preserving reconstruction (reject) --------------------------------
//
// reject must return WRAPPED markdown (it is loaded back into the editor), but
// the diff/hunk numbering is on the STRIPPED body. So we walk the stripped diff
// while consuming the wrapped `newMd` in parallel: equal / kept-insert segments
// are copied from the wrapped string (carrying any anchor scaffolding along), the
// rejected insert is dropped, and a restored deletion is spliced in as plain
// baseline text. Anchors thus survive a reject untouched.

/** Anchor tokens, anchored at the current index (mirrors stripAnchors exactly). */
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
  // Attach any trailing closers that belong to the content we just consumed.
  let close: number;
  while ((close = matchLen(CLOSER, w, i)) > 0) i += close;
  return { slice: w.slice(start, i), end: i };
}

/**
 * Reject hunk `k`: return new WRAPPED live markdown with that hunk reverted to
 * baseline — the rejected insertion dropped, or the rejected deletion restored —
 * while every other hunk, and every comment anchor, stays put. The hunk index is
 * the {@link listContentHunks} (stripped) numbering.
 */
export function rejectHunk(oldMd: string, newMd: string, k: number): string {
  const segs = withHunkIndex(stripAnchors(oldMd), stripAnchors(newMd));
  let out = '';
  let w = 0; // cursor into the wrapped newMd
  for (const seg of segs) {
    if (seg.type === 'delete') {
      // Absent from new (so no wrapped chars to consume). Restore as plain text
      // iff this is the rejected hunk.
      if (seg.hunk === k) out += seg.value;
      continue;
    }
    // equal or insert: present in the stripped new body, so present (possibly
    // wrapped) in newMd. Consume the matching wrapped span.
    const { slice, end } = takeStripped(newMd, w, seg.value.length);
    w = end;
    const drop = seg.type === 'insert' && seg.hunk === k;
    if (!drop) out += slice;
  }
  out += newMd.slice(w); // any trailing scaffolding past the last content char
  return out;
}

/**
 * Accept hunk `k`: return the new baseline (anchor-stripped) with that hunk
 * applied — the accepted insertion baked in, or the accepted deletion removed —
 * so it stops diffing while the others still do. The baseline is only ever used
 * for diffing (always stripped first), so returning it stripped is exact; the
 * live doc, and its anchors, are untouched by accept.
 */
export function acceptHunk(oldMd: string, newMd: string, k: number): string {
  const segs = withHunkIndex(stripAnchors(oldMd), stripAnchors(newMd));
  let out = '';
  for (const seg of segs) {
    if (seg.type === 'equal') out += seg.value;
    else if (seg.type === 'delete') {
      if (seg.hunk !== k) out += seg.value; // keep un-accepted deletions in baseline
    } else {
      // insert: absent from old. Add it to the baseline iff this is the hunk.
      if (seg.hunk === k) out += seg.value;
    }
  }
  return out;
}
