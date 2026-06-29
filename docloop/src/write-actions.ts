/**
 * M2 write actions (Step 3): the three doc-mutating operations the GUI exposes —
 * add comment, reply, resolve — expressed against a live {@link DocloopEditor}.
 *
 * ## The source-of-truth rule
 * The editor's ProseMirror doc is authoritative. Every action ends by
 * serialising the doc to markdown via the M0 round-trip path (`getMarkdown()`),
 * applying a pure foot.ts string transform, and reloading the editor with
 * `replaceAll`. So the on-disk markdown and the editor never disagree, and every
 * mutation goes through the exact serialiser the M0 gate proved faithful.
 *
 * "Add comment" additionally needs a ProseMirror step (applying the
 * `commentAnchor` mark to the selected range) because the selection lives in PM
 * positions; the other two are pure foot-region edits and need no PM step beyond
 * the reload.
 */
import { editorViewCtx } from '@milkdown/core';
import { getMarkdown, replaceAll } from '@milkdown/utils';
import type { DocloopEditor } from './editor';
import { commentAnchorMark } from './anchor';
import { addThread, appendReply, removeThread } from './foot';

/** A short, unique-ish thread id (`t` + base36 time + small random tail). */
export function newThreadId(): string {
  return `t${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}

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
 * Add a comment on the current selection:
 *   1. apply the `commentAnchor` mark (threadId) to the selected range,
 *   2. serialise → `addThread` to create the `<article>` body → reload.
 * Returns the new thread id (so the UI can focus its reply box), or null if
 * there was no selection to anchor on.
 */
export function addComment(ed: DocloopEditor, initialReply = ''): string | null {
  if (!hasTextSelection(ed)) return null;
  const id = newThreadId();

  // 1. Mark the selected span in PM space.
  const ctx = ed.editor.ctx;
  const markType = commentAnchorMark.type(ctx);
  const view = ctx.get(editorViewCtx);
  const { from, to } = view.state.selection;
  const mark = markType.create({ threadId: id });
  view.dispatch(view.state.tr.addMark(from, to, mark));

  // 2. Serialise (now contains :mark[span]{#id}) and add the foot article.
  const md = currentMarkdown(ed);
  loadMarkdown(ed, addThread(md, id, initialReply));
  return id;
}

/** Append a reply to a thread, then reload. */
export function reply(ed: DocloopEditor, id: string, text: string): void {
  const md = currentMarkdown(ed);
  loadMarkdown(ed, appendReply(md, id, text));
}

/** Resolve a thread: unwrap its mark + delete its article, then reload. */
export function resolve(ed: DocloopEditor, id: string): void {
  const md = currentMarkdown(ed);
  loadMarkdown(ed, removeThread(md, id));
}
