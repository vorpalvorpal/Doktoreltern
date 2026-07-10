/**
 * Document-side write actions: the editor half of the three review operations
 * (add comment / reply / resolve). Since the sidecar refactor these touch only
 * the **anchor** in the document — applying or unwrapping the `:mark` directive.
 * The comment bodies themselves live in the `threads/<id>/` store and are managed
 * over HTTP by src/threads-client.ts (browser) / src/threads-store.ts (server);
 * "reply" has no document side at all, so it isn't here.
 *
 * ## The source-of-truth rule (document side)
 * The editor's ProseMirror doc is authoritative for the *document* (the prose and
 * its anchors). "Add" applies the anchor mark directly in PM space; "resolve"
 * unwraps it through the M0 serialise → string-transform → reload round-trip, so
 * the on-disk markdown and the editor never disagree and every mutation goes
 * through the exact serialiser the M0 gate proved faithful.
 */
import { editorViewCtx } from '@milkdown/core';
import { getMarkdown, replaceAll } from '@milkdown/utils';
import type { EditorState } from '@milkdown/prose/state';
import type { Node as PMNode } from '@milkdown/prose/model';
import type { DocloopEditor } from './editor';
import { commentAnchorMark, commentBlockNode } from './anchor';
import { unwrapAnchor } from './threads';

/**
 * Milkdown's markdown serializer (`@milkdown/transformer`'s `SerializerState`)
 * unconditionally trims leading/trailing whitespace off of *every* per-node
 * mark chunk before pushing it (avoiding e.g. `**bold **`), and only re-merges
 * chunks that end up strictly adjacent afterwards. When one continuous PM mark
 * spans a plain-text run directly abutting a differently-marked run (e.g. plain
 * text immediately before an `inlineCode` span) at a whitespace boundary, that
 * trim step extracts the boundary whitespace out into its own unmarked
 * sibling — which breaks the adjacency the merge depends on. The result: a
 * single continuous `commentAnchor`/`mark` PM mark serializes as two (or more)
 * `:mark[...]{#id}` fragments with only whitespace between them, even though
 * nothing is wrong with the document (confirmed via `doc.toJSON()` during
 * development of package D — see the plan-change note in dl-D). Re-parsing the
 * fragmented text reproduces the identical PM mark structure, so this isn't
 * fixable by reloading; it has to be repaired in the serialized string every
 * time. Since it only fires for same-id `:mark[...]` runs separated by pure
 * whitespace, stitching them back into one directive is safe and
 * content-preserving regardless of why they fragmented.
 */
function coalesceMarkFragments(md: string): string {
  const pattern = /:mark\[([\s\S]*?)\]\{#([^}]+)\}(\s+):mark\[([\s\S]*?)\]\{#\2\}/g;
  let out = md;
  for (;;) {
    const next: string = out.replace(
      pattern,
      (_m, a: string, id: string, ws: string, b: string) => `:mark[${a}${ws}${b}]{#${id}}`,
    );
    if (next === out) return out;
    out = next;
  }
}

/** Read the current editor doc as markdown (the M0 serialiser). */
export function currentMarkdown(ed: DocloopEditor): string {
  return coalesceMarkFragments(ed.editor.action(getMarkdown()));
}

/** Reload the editor from markdown (re-parses through the M0 path). */
export function loadMarkdown(ed: DocloopEditor, markdown: string): void {
  ed.editor.action(replaceAll(markdown));
}

/**
 * Is there a non-empty text selection to anchor a comment on? (You cannot
 * comment on a collapsed cursor — there'd be no span to wrap.)
 */
export function hasTextSelection(ed: DocloopEditor): boolean {
  const { from, to } = ed.view.state.selection;
  return to > from;
}

/**
 * Does the current selection overlap an existing comment anchor? Highlighting
 * auto-creates a new thread (see main.ts), and this guards against wrapping a
 * second anchor over text that's already commented.
 */
export function selectionOverlapsAnchor(ed: DocloopEditor): boolean {
  const { from, to } = ed.view.state.selection;
  const markType = commentAnchorMark.type(ed.editor.ctx);
  return ed.view.state.doc.rangeHasMark(from, to, markType);
}

/**
 * Is the editor's document empty (no visible text)? The Milkdown-instance
 * equivalent of `input.value.trim() === ''` for the old plain-textarea
 * compose box — used to decide whether a blurred compose box should be
 * treated as "nothing written" (abandon / just deactivate) or "has content"
 * (save it).
 */
export function isDocEmpty(ed: DocloopEditor): boolean {
  return ed.view.state.doc.textContent.trim() === '';
}

/**
 * Snap a raw browser/PM selection `[from, to)` to a sane anchor span before it's
 * wrapped in a `:mark`/`:::mark` directive (package D root-cause fix):
 *
 *   1. Trim leading/trailing whitespace out of the span.
 *   2. Word-snap: a boundary that falls inside a word is pushed outward to that
 *      word's edge — a partially-selected word is anchored whole, never split.
 *   3. Inline-code snap: a boundary that falls strictly inside a text run
 *      carrying the `inlineCode` mark is pushed outward to the edge of that
 *      code span, so the anchor never splits a code span in two.
 *
 * Returns `null` if the span is empty after trimming (whitespace-only
 * selection) — callers treat that the same as no selection at all.
 */
export function snapSelection(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number } | null {
  const doc = state.doc;
  let a = Math.min(from, to);
  let b = Math.max(from, to);

  // The character occupying position `pos` (i.e. doc.textBetween(pos, pos+1)),
  // or '' at a node boundary / out of range — treated like whitespace below.
  const charAt = (pos: number): string =>
    pos < 0 || pos + 1 > doc.content.size ? '' : doc.textBetween(pos, pos + 1);
  const isSpace = (ch: string): boolean => ch === '' || /\s/.test(ch);
  const isWord = (ch: string): boolean => /\w/.test(ch);

  // 1. Trim whitespace from both ends.
  while (a < b && isSpace(charAt(a))) a++;
  while (b > a && isSpace(charAt(b - 1))) b--;
  if (a >= b) return null;

  // 2. Word-snap outward: keep expanding while the boundary splits a word.
  while (a > 0 && isWord(charAt(a - 1)) && isWord(charAt(a))) a--;
  while (b < doc.content.size && isWord(charAt(b - 1)) && isWord(charAt(b))) b++;

  // 3. Inline-code snap: extend outward to cover a partially-selected code span.
  const codeMarkType = doc.type.schema.marks.inlineCode;
  if (codeMarkType) {
    const hasCode = (pos: number): boolean =>
      pos >= 0 && pos + 1 <= doc.content.size && doc.rangeHasMark(pos, pos + 1, codeMarkType);
    if (hasCode(a - 1) && hasCode(a)) {
      while (hasCode(a - 1)) a--;
    }
    if (hasCode(b - 1) && hasCode(b)) {
      while (hasCode(b)) b++;
    }
  }

  return { from: a, to: b };
}

/**
 * Does `[from, to)` stay within a single top-level (depth-1) block? Used to
 * decide inline `:mark` vs. container `:::mark` (package D2) — a selection
 * that stays inside one top-level block gets an inline mark; one that spans
 * more than one gets wrapped whole in the container node.
 */
function withinOneTopBlock(doc: PMNode, from: number, to: number): boolean {
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  if ($from.depth < 1 || $to.depth < 1) return true;
  return $from.start(1) === $to.start(1);
}

/**
 * Apply the comment anchor (`threadId` = `id`) to the current selection, marking
 * the span in PM space. Returns false (a no-op) if there's no selection to wrap,
 * or if the selection is whitespace-only after snapping. The store thread is
 * created lazily on the first reply, so this is all the document needs — the
 * live doc serialises to `:mark[span]{#id}` (single block) or
 * `:::mark{#id}`…`:::` (a selection spanning more than one top-level block).
 *
 * Root-cause fix (package D): `tr.addMark` on a raw browser selection used to
 * fragment across blocks and split words / code spans mid-run. The selection is
 * first snapped ({@link snapSelection}), then routed to an inline mark or a
 * whole-block wrap depending on whether it still spans more than one top-level
 * block. A post-transaction guard re-serialises and checks the new id appears
 * exactly once, rolling back and throwing rather than persisting a fragmented
 * anchor.
 */
export function applyAnchor(ed: DocloopEditor, id: string): boolean {
  if (!hasTextSelection(ed)) return false;
  const ctx = ed.editor.ctx;
  const markType = commentAnchorMark.type(ctx);
  const blockType = commentBlockNode.type(ctx);
  const view = ctx.get(editorViewCtx);
  const prevState = view.state;
  const { from, to } = prevState.selection;

  const snapped = snapSelection(prevState, from, to);
  if (!snapped) return false;

  const doc = prevState.doc;
  let tr = prevState.tr;
  if (withinOneTopBlock(doc, snapped.from, snapped.to)) {
    tr = tr.addMark(snapped.from, snapped.to, markType.create({ threadId: id }));
  } else {
    const $from = doc.resolve(snapped.from);
    const $to = doc.resolve(snapped.to);
    const range = $from.blockRange($to);
    if (!range) return false; // couldn't compute a block-wrapping range — refuse rather than guess
    tr = tr.wrap(range, [{ type: blockType, attrs: { threadId: id } }]);
  }

  view.dispatch(tr);

  // D3 guard rail: the new id must appear in the re-serialized doc exactly
  // once. currentMarkdown() already repairs same-id fragments that are only a
  // serializer artifact (see coalesceMarkFragments); anything left over is a
  // genuine fragmentation bug. extractAnchors() coalesces same-id fragments,
  // so it can't detect that here — count the directive attribute textually.
  const md = currentMarkdown(ed);
  const idPattern = new RegExp(`\\{#${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'g');
  const count = (md.match(idPattern) ?? []).length;
  if (count !== 1) {
    view.updateState(prevState); // roll back — refuse to persist a fragmented anchor
    throw new Error(`applyAnchor: guard failed — ${count} occurrences of {#${id}} (expected 1)`);
  }

  return true;
}

/**
 * Resolve a thread's document side: unwrap its anchor back to plain text, then
 * reload. (Deleting the store directory is the caller's job — see
 * threads-client.ts `resolveThread`.)
 */
export function removeAnchor(ed: DocloopEditor, id: string): void {
  loadMarkdown(ed, unwrapAnchor(currentMarkdown(ed), id));
}
