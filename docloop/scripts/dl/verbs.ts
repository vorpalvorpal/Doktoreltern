/**
 * `dl reply` / `dl comment` / `dl resolve` (package C3) — the deterministic
 * anchor/comment verbs ported from `scripts/thread-actions.ts` to multi-doc +
 * quiet output + journalling. Doc is always inferred (from the anchor, or
 * from the span's match).
 *
 * PLAN DEVIATION (flagged in the final report): plan C3 says `dl comment`
 * should reuse "the existing editor-backed `newThread` machinery" (jsdom +
 * Milkdown's `applyAnchor`). That machinery boots a DOM, which contradicts
 * dl-00-overview's central architectural call ("`dl` runs DOM-free" — the
 * whole point of the canonical-form spike was to avoid booting jsdom/Milkdown
 * per call). This module instead places anchors by direct markdown string
 * splicing (find the exact span in the doc's raw text, wrap it in
 * `:mark[...]{#id}`, canonicalise) — content-preserving by construction
 * (the wrapped text is byte-identical to what was found) and keeps `dl`
 * DOM-free end to end. The old `scripts/thread-actions.ts#newThread` is left
 * untouched for the legacy `npm run thread` CLI.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractAnchors, nextThreadId, unwrapAnchor } from '../../src/threads';
import { addComment, listThreads, resolveThread as storeResolveThread } from '../../src/threads-store';
import { trackedDocs, isDocPath } from './docs';
import { canonicalize } from './canonical';
import { refOf, parseRef } from './refs';
import { splitBlocks } from './blocks';
import { recordWrite, recordThread } from './journal';

/** Every offset of `needle` in `text`, non-overlapping. */
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

/** The (single) tracked doc holding a live anchor for `threadId`, or `null` if orphaned. */
async function tryFindDocWithAnchor(ws: string, threadId: string): Promise<{ doc: string; text: string } | null> {
  for (const doc of await trackedDocs(ws)) {
    const text = readFileSync(join(ws, doc), 'utf8');
    if (extractAnchors(text).some((a) => a.id === threadId)) return { doc, text };
  }
  return null;
}

/** Find the (single) tracked doc holding a live anchor for `threadId`, or throw. */
async function findDocWithAnchor(ws: string, threadId: string): Promise<{ doc: string; text: string }> {
  const found = await tryFindDocWithAnchor(ws, threadId);
  if (!found) throw new Error(`no live anchor #${threadId} in any doc`);
  return found;
}

/** Record a journalled write for a thread-store file already on disk: hash its ACTUAL bytes, not the caller's input. */
function recordThreadFileWrite(ws: string, relPath: string): void {
  const bytes = readFileSync(join(ws, relPath), 'utf8');
  recordWrite(ws, relPath, refOf(bytes));
}

/** `dl reply <thread>` (body on stdin). */
export async function replyVerb(
  ws: string,
  threadId: string,
  author: string,
  body: string,
): Promise<{ doc: string }> {
  const { doc } = await findDocWithAnchor(ws, threadId);
  const threadsDir = join(ws, 'threads');
  const comment = await addComment(threadsDir, threadId, { author, body });
  recordThreadFileWrite(ws, `threads/${threadId}/${String(comment.seq).padStart(4, '0')}.md`);
  recordThread(ws, 'replied', threadId);
  return { doc };
}

export interface CommentOpts {
  doc?: string;
  /** "<doc>@<ref>:<n>" */
  block?: string;
}

/** `dl comment "<span>" [--doc <doc>] [--block <doc>@<ref>:<n>]` (body on stdin). */
export async function commentVerb(
  ws: string,
  span: string,
  author: string,
  body: string,
  opts: CommentOpts,
): Promise<{ id: string; doc: string; newRef: string }> {
  let candidateDocs: string[];
  let blockRestrict: { n: number } | null = null;

  if (opts.block) {
    const [docPart, nPart] = opts.block.split(':');
    const { doc, hash } = parseRef(docPart);
    if (!isDocPath(doc)) throw new Error(`not a reviewable doc path "${doc}"`);
    const bytes = readFileSync(join(ws, doc), 'utf8');
    if (refOf(bytes) !== hash) {
      throw new Error(`stale ref (doc is now ${doc}@${refOf(bytes)}) — re-read`);
    }
    candidateDocs = [doc];
    blockRestrict = { n: Number(nPart) };
  } else if (opts.doc) {
    if (!isDocPath(opts.doc)) throw new Error(`not a reviewable doc path "${opts.doc}"`);
    candidateDocs = [opts.doc];
  } else {
    candidateDocs = await trackedDocs(ws);
  }

  const matches: { doc: string; offset: number }[] = [];
  for (const doc of candidateDocs) {
    const text = readFileSync(join(ws, doc), 'utf8');
    if (blockRestrict) {
      const blocks = splitBlocks(text);
      const block = blocks.find((b) => b.n === blockRestrict!.n);
      if (!block) throw new Error(`block ${blockRestrict.n} out of range in ${doc}`);
      let base = 0;
      for (const b of blocks) {
        if (b.n === block.n) break;
        base += b.segment.length;
      }
      for (const off of findOffsets(block.segment, span)) matches.push({ doc, offset: base + off });
    } else {
      for (const off of findOffsets(text, span)) matches.push({ doc, offset: off });
    }
  }

  if (matches.length === 0) throw new Error(`not found: ${JSON.stringify(span)}`);
  if (matches.length > 1) {
    const docs = [...new Set(matches.map((m) => m.doc))].sort();
    throw new Error(`ambiguous: ${matches.length} matches in ${docs.join(', ')}`);
  }

  const [{ doc, offset }] = matches;
  const text = readFileSync(join(ws, doc), 'utf8');

  // Union-wide id allocation: every doc's anchors + the store, so a fresh id
  // never collides with an anchor-only id living in another doc.
  const existingIds = new Set<string>();
  for (const d of await trackedDocs(ws)) {
    const t = d === doc ? text : readFileSync(join(ws, d), 'utf8');
    for (const a of extractAnchors(t)) existingIds.add(a.id);
  }
  for (const t of await listThreads(join(ws, 'threads'))) existingIds.add(t.id);
  const id = nextThreadId([...existingIds]);

  const wrapped = text.slice(0, offset) + `:mark[${span}]{#${id}}` + text.slice(offset + span.length);
  const canonical = await canonicalize(wrapped);
  const priorBytes = text; // doc's bytes before this verb touched it — restored if the paired store write fails
  writeFileSync(join(ws, doc), canonical, 'utf8');
  const newRef = refOf(canonical);

  try {
    const comment = await addComment(join(ws, 'threads'), id, { author, body });
    recordThreadFileWrite(ws, `threads/${id}/${String(comment.seq).padStart(4, '0')}.md`);
  } catch (err) {
    writeFileSync(join(ws, doc), priorBytes, 'utf8');
    throw err;
  }
  recordWrite(ws, doc, newRef);
  recordThread(ws, 'opened', id);

  return { id, doc, newRef };
}

/**
 * `dl resolve <thread> [--note "<text>"]`. Works on an ORPHANED thread (no
 * live anchor in any doc) too: there is nothing to unwrap, so it just writes
 * the `resolved.md` marker and journals it — `doc`/`newRef` come back `null`
 * (the CLI reports "no live anchor" instead of a doc ref).
 */
export async function resolveVerb(
  ws: string,
  threadId: string,
  author: string,
  note: string | undefined,
): Promise<{ doc: string | null; newRef: string | null }> {
  const found = await tryFindDocWithAnchor(ws, threadId);
  let doc: string | null = null;
  let newRef: string | null = null;

  if (found) {
    const unwrapped = unwrapAnchor(found.text, threadId);
    const canonical = await canonicalize(unwrapped);
    const priorBytes = found.text; // restored if the paired store write fails
    writeFileSync(join(ws, found.doc), canonical, 'utf8');
    newRef = refOf(canonical);
    try {
      await storeResolveThread(join(ws, 'threads'), threadId, { author, note });
    } catch (err) {
      writeFileSync(join(ws, found.doc), priorBytes, 'utf8');
      throw err;
    }
    doc = found.doc;
    recordWrite(ws, found.doc, newRef);
  } else {
    await storeResolveThread(join(ws, 'threads'), threadId, { author, note });
  }

  recordThreadFileWrite(ws, `threads/${threadId}/resolved.md`);
  recordThread(ws, 'resolved', threadId, note);

  return { doc, newRef };
}
