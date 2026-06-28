/**
 * Diff → ProseMirror decoration mapping, and <mark> thread highlighting.
 *
 * The load-bearing idea (per the M1 brief): map the diff to ProseMirror
 * **positions**, not raw-markdown offsets. Raw markdown carries punctuation and
 * the `<ins>`/`<del>`/`<mark>` tags that don't exist as visible text in the
 * editor doc, so diffing the markdown string and then trying to place those
 * offsets in the doc is brittle. Instead we diff the editor doc's **text
 * content** and place decorations against a text-offset → PM-position index.
 */
import type { Node as PMNode } from '@milkdown/prose/model';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { computeDiff } from './diff';

/**
 * A flat view of a doc's body text: the concatenated text content of every text
 * node **above the last `hr`** (the foot-region delimiter), plus a function that
 * maps a character offset in that string back to a ProseMirror position.
 *
 * Only text above the last `hr` is included so the `<article>` foot-region is
 * excluded from diffing — the same rule computeDiff applies to markdown, applied
 * here to the live doc.
 */
export interface BodyTextIndex {
  /** concatenated visible text of the body (no tags, no markdown punctuation) */
  text: string;
  /** PM position of the character at offset `i`; `posAt(text.length)` is the end */
  posAt(offset: number): number;
}

export function buildBodyTextIndex(doc: PMNode): BodyTextIndex {
  // Find the position of the LAST top-level `hr` (the final `---`). Text at or
  // after it belongs to the foot-region and is ignored.
  let lastHrPos = Infinity;
  doc.forEach((node, offset) => {
    if (node.type.name === 'hr') lastHrPos = offset;
  });

  // Walk text nodes before the hr, recording the PM position of each character.
  // `offsets[i]` is the PM position of text[i]; we also push the position just
  // past the final character so a range end maps cleanly.
  let text = '';
  const offsets: number[] = [];
  doc.descendants((node, pos) => {
    if (pos >= lastHrPos) return false; // stop descending into the foot-region
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) offsets.push(pos + i);
      text += node.text;
    }
    return true;
  });
  // End sentinel: position after the last body character (or after the last
  // text node if the body is empty we fall back to position 1, inside the doc).
  const endPos = offsets.length ? offsets[offsets.length - 1] + 1 : 1;

  return {
    text,
    posAt: (offset: number) => (offset < offsets.length ? offsets[offset] : endPos),
  };
}

/** A single deletion, surfaced as a red strikethrough widget in the doc. */
function makeDeleteWidget(removed: string): (view: unknown, getPos: unknown) => HTMLElement {
  return () => {
    const span = document.createElement('del');
    span.className = 'docloop-del';
    span.textContent = removed;
    return span;
  };
}

/**
 * Build the diff decoration set for the editor doc (which holds `newMd`),
 * relative to `oldMd`.
 *
 * - inserted words  → inline decoration (class `docloop-ins`, rendered green)
 *   spanning the inserted text in the doc.
 * - deleted words   → widget decoration (a red <del>) at the point in the doc
 *   where the text was removed.
 *
 * We diff the two docs' body **text content** (not markdown). `oldDoc` is a doc
 * parsed from `oldMd`; the live editor doc is `newDoc`. computeDiff is reused on
 * the two text-content strings — neither contains a `---`, so its foot-region
 * split is a no-op and it acts as a plain word diff.
 */
export function buildDiffDecorations(
  oldDoc: PMNode,
  newDoc: PMNode,
): DecorationSet {
  return DecorationSet.create(newDoc, diffDecorationList(oldDoc, newDoc));
}

/** The diff decorations as a flat list (so they can be merged with others). */
export function diffDecorationList(oldDoc: PMNode, newDoc: PMNode): Decoration[] {
  const newIdx = buildBodyTextIndex(newDoc);
  const oldText = buildBodyTextIndex(oldDoc).text;

  const segs = computeDiff(oldText, newIdx.text);

  const decos: Decoration[] = [];
  let cursor = 0; // offset into newIdx.text
  for (const seg of segs) {
    if (seg.type === 'equal') {
      cursor += seg.value.length;
    } else if (seg.type === 'insert') {
      const from = newIdx.posAt(cursor);
      const to = newIdx.posAt(cursor + seg.value.length);
      // Inline decoration over the inserted span. One Decoration per insert
      // segment; diffWords groups a run of inserted words into a single segment,
      // so N inserted *words* between two equal runs yield 1 segment / 1 deco.
      // attrs (1st obj) set the DOM class; spec (2nd obj) carries a stable key so
      // callers can identify inserts without reaching into PM internals.
      decos.push(
        Decoration.inline(from, to, { class: 'docloop-ins' }, { key: `ins-${cursor}` }),
      );
      cursor += seg.value.length;
    } else {
      // delete: text is absent from the new doc, so it has no span here. Anchor
      // a widget at the current cursor position showing the removed words.
      const at = newIdx.posAt(cursor);
      decos.push(
        Decoration.widget(at, makeDeleteWidget(seg.value), {
          // side > 0 so the widget sits after content already at `at`, and a
          // stable key so the set is comparable in tests.
          side: 1,
          key: `del-${cursor}`,
        }),
      );
    }
  }
  return decos;
}

/**
 * Highlight every comment-anchor span in the doc and tag it with the thread id +
 * a 1-based badge number, so the sidebar can cross-link.
 *
 * As of M2 (the "road bump" — see src/comment-mark.ts) the anchor is a proper
 * ProseMirror **schema mark** (`commentAnchor`, carrying a `threadId` attr), not
 * the M1 raw-html-node pairs. We therefore locate the highlight by scanning text
 * nodes that carry the mark and coalescing contiguous runs of the *same*
 * threadId into one span. (Two anchors with different ids that happen to touch
 * stay separate; a single anchor stays one run because ProseMirror keeps equal
 * adjacent marks on one text node.)
 */
export interface MarkHighlight {
  id: string;
  index: number; // 1-based badge number, document order
  from: number;
  to: number;
}

/** The schema mark name; mirrors COMMENT_ANCHOR in src/comment-mark.ts. */
const COMMENT_ANCHOR = 'commentAnchor';

export function findMarkHighlights(doc: PMNode): MarkHighlight[] {
  const highlights: MarkHighlight[] = [];
  // The open run we're currently extending, if any.
  let run: { id: string; from: number; to: number } | null = null;

  const flush = () => {
    if (run) {
      highlights.push({
        id: run.id,
        index: highlights.length + 1,
        from: run.from,
        to: run.to,
      });
      run = null;
    }
  };

  doc.descendants((node, pos) => {
    if (!node.isText) {
      // A non-text node breaks any open run (anchors don't span block bounds).
      flush();
      return true;
    }
    const anchorMark = node.marks.find((m) => m.type.name === COMMENT_ANCHOR);
    const id = (anchorMark?.attrs.threadId as string | undefined) ?? null;
    if (id == null) {
      flush();
      return true;
    }
    const from = pos;
    const to = pos + node.nodeSize;
    if (run && run.id === id && run.to === from) {
      run.to = to; // extend the current contiguous same-id run
    } else {
      flush();
      run = { id, from, to };
    }
    return true;
  });
  flush();

  return highlights;
}

/** The <mark> highlight decorations as a flat list. */
export function markDecorationList(doc: PMNode): Decoration[] {
  return findMarkHighlights(doc).map((h) =>
    Decoration.inline(h.from, h.to, {
      class: 'docloop-mark',
      'data-thread': h.id,
      'data-badge': String(h.index),
    }),
  );
}

export function buildMarkDecorations(doc: PMNode): DecorationSet {
  return DecorationSet.create(doc, markDecorationList(doc));
}

/**
 * The full read-view decoration set: diff decorations (insert spans + delete
 * widgets) plus the <mark> comment-anchor highlights, in one set ready to hand
 * to the editor. `newDoc` is the live (current-version) doc; `oldDoc` the
 * previous version it is diffed against.
 */
export function buildReadViewDecorations(oldDoc: PMNode, newDoc: PMNode): DecorationSet {
  return DecorationSet.create(newDoc, [
    ...diffDecorationList(oldDoc, newDoc),
    ...markDecorationList(newDoc),
  ]);
}
