/**
 * Per-hunk accept / reject of the body diff (M2 Step 4 — minimal).
 *
 * A "hunk" is a single insert-or-delete segment of the body word-diff between the
 * baseline (`oldMd`) and the live doc (`newMd`) — exactly the segments
 * `computeDiff` returns, numbered in document order (0-based). The read view
 * draws one decoration per hunk; these helpers let the user resolve one at a
 * time.
 *
 * Both operations are pure markdown→markdown string transforms working on the
 * **body** (above the final `---`); the foot-region is split off and re-attached
 * untouched, so threads are never disturbed. They reconstruct the body by
 * walking the diff segments and choosing, per hunk, the old or new side — the
 * same equal/insert/delete vocabulary diff.ts already pins.
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
import { computeDiff, splitFoot, type DiffSegment } from './diff';

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

/**
 * Reject hunk `k`: return new live markdown with that hunk reverted to baseline.
 * The body is rebuilt from the diff (insert k dropped / delete k restored); the
 * live doc's own foot-region is re-attached unchanged.
 */
export function rejectHunk(oldMd: string, newMd: string, k: number): string {
  const segs = withHunkIndex(oldMd, newMd);
  let body = '';
  for (const seg of segs) {
    if (seg.type === 'equal') body += seg.value;
    else if (seg.type === 'insert') {
      if (seg.hunk !== k) body += seg.value; // drop the rejected insertion
    } else {
      // delete: present in old, absent in new. Restore it iff this is the hunk.
      if (seg.hunk === k) body += seg.value;
    }
  }
  return reattach(body, newMd);
}

/**
 * Accept hunk `k`: return new baseline markdown with that hunk applied. The
 * baseline body is rebuilt (insert k added / delete k removed); the baseline's
 * own foot-region is re-attached unchanged.
 */
export function acceptHunk(oldMd: string, newMd: string, k: number): string {
  const segs = withHunkIndex(oldMd, newMd);
  let body = '';
  for (const seg of segs) {
    if (seg.type === 'equal') body += seg.value;
    else if (seg.type === 'delete') {
      if (seg.hunk !== k) body += seg.value; // keep un-accepted deletions in baseline
    } else {
      // insert: absent from old. Add it to the baseline iff this is the hunk.
      if (seg.hunk === k) body += seg.value;
    }
  }
  return reattach(body, oldMd);
}

/** Re-attach `source`'s foot-region to a freshly rebuilt `body`. */
function reattach(body: string, source: string): string {
  const { foot } = splitFoot(source);
  return foot ? `${body}\n${foot}` : body;
}
