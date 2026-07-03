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
import type { DocloopEditor } from './editor';
import { commentAnchorMark } from './anchor';
import { unwrapAnchor } from './threads';

/** Read the current editor doc as markdown (the M0 serialiser). */
export function currentMarkdown(ed: DocloopEditor): string {
  return ed.editor.action(getMarkdown());
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
 * Apply the comment anchor (`threadId` = `id`) to the current selection, marking
 * the span in PM space. Returns false (a no-op) if there's no selection to wrap.
 * The store thread is created lazily on the first reply, so this is all the
 * document needs — the live doc serialises to `:mark[span]{#id}`.
 */
export function applyAnchor(ed: DocloopEditor, id: string): boolean {
  if (!hasTextSelection(ed)) return false;
  const ctx = ed.editor.ctx;
  const markType = commentAnchorMark.type(ctx);
  const view = ctx.get(editorViewCtx);
  const { from, to } = view.state.selection;
  view.dispatch(view.state.tr.addMark(from, to, markType.create({ threadId: id })));
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
