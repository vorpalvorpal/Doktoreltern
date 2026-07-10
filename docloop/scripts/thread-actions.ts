/**
 * Deterministic anchor/comment operations for Claude's turn — the "MCP" side
 * equivalent of the GUI's own highlight-and-comment actions. Mirrors how the GUI
 * never lets a human hand-type a `:mark` directive (it wraps a live selection):
 * `newThread` drives the real editor/parser (`createEditor`, `applyAnchor`) so
 * the id, the directive syntax, and the anchor placement are never hand-authored.
 * This also gets the content-preservation check for free on every anchor
 * operation, since anchoring must never change visible text.
 *
 * Split from `scripts/thread.ts` (the CLI entry point) so these functions are
 * directly testable without going through argv/stdin/process.exit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { bootstrapDom } from './dom-bootstrap';
import { extractAnchors, unwrapAnchor, nextThreadId } from '../src/threads';
import { addComment, resolveThread as storeResolveThread, listThreads, type Comment } from '../src/threads-store';
import { contentDiffSummary } from '../src/content-check';

export interface ThreadPaths {
  docPath: string;
  threadsDir: string;
}

/** Bootstrap jsdom only if no DOM is already present (e.g. under vitest's own jsdom environment). */
function ensureDom(): void {
  if (typeof document === 'undefined') bootstrapDom();
}

/** Every offset of `needle` in `text`, non-overlapping. Never guesses which one is meant. */
function findOffsets(text: string, needle: string): number[] {
  const offsets: number[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at < 0) break;
    offsets.push(at);
    from = at + needle.length;
  }
  return offsets;
}

/**
 * `thread new`: locate `needle` (an exact, unique span of the document's visible
 * text) and anchor it with a freshly allocated thread id, via the SAME
 * `applyAnchor` function the GUI calls for "highlight → add comment" — never
 * hand-authored directive syntax. Zero matches or more than one is an error (we
 * never guess). Aborts with no write if anchoring somehow changed visible
 * content. Creates the first comment in the thread and returns the assigned id.
 */
export async function newThread(
  paths: ThreadPaths,
  needle: string,
  author: string,
  body: string,
): Promise<string> {
  ensureDom();
  const { createEditor } = await import('../src/editor');
  const { applyAnchor, currentMarkdown } = await import('../src/write-actions');
  const { buildBodyTextIndex } = await import('../src/decorations');
  const { TextSelection } = await import('@milkdown/prose/state');

  const markdown = readFileSync(paths.docPath, 'utf8');
  const ed = await createEditor(document.createElement('div'), markdown, { editable: true });
  try {
    const before = buildBodyTextIndex(ed.view.state.doc);
    const offsets = findOffsets(before.text, needle);
    if (offsets.length === 0) throw new Error(`not found: ${JSON.stringify(needle)}`);
    if (offsets.length > 1) {
      throw new Error(`ambiguous: ${offsets.length} matches for ${JSON.stringify(needle)}`);
    }

    const existingIds = [
      ...extractAnchors(markdown).map((a) => a.id),
      ...(await listThreads(paths.threadsDir)).map((t) => t.id),
    ];
    const id = nextThreadId(existingIds);

    const from = before.posAt(offsets[0]);
    const to = before.posAt(offsets[0] + needle.length);
    ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(ed.view.state.doc, from, to)));
    applyAnchor(ed, id);

    const afterText = buildBodyTextIndex(ed.view.state.doc).text;
    const diff = contentDiffSummary(before.text, afterText);
    if (diff) throw new Error(`anchoring changed visible content (${diff})`);

    writeFileSync(paths.docPath, currentMarkdown(ed), 'utf8');
    await addComment(paths.threadsDir, id, { author, body });
    return id;
  } finally {
    await ed.destroy();
  }
}

/** `thread reply`: append a comment to an existing, live (still-anchored) thread. */
export async function replyThread(
  paths: ThreadPaths,
  id: string,
  author: string,
  body: string,
): Promise<Comment> {
  const markdown = readFileSync(paths.docPath, 'utf8');
  if (!extractAnchors(markdown).some((a) => a.id === id)) {
    throw new Error(`no live anchor #${id} in doc.md`);
  }
  return addComment(paths.threadsDir, id, { author, body });
}

/**
 * `thread resolve`: unwrap the anchor back to plain text and mark the thread
 * resolved (spec decision 9: `threads/<id>/resolved.md`, dir survives).
 */
export async function resolveThreadCmd(paths: ThreadPaths, id: string): Promise<void> {
  const markdown = readFileSync(paths.docPath, 'utf8');
  writeFileSync(paths.docPath, unwrapAnchor(markdown, id), 'utf8');
  await storeResolveThread(paths.threadsDir, id, { author: 'C' });
}
