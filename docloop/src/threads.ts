/**
 * Anchor extraction + id allocation over the document markdown.
 *
 * Since the sidecar refactor, comment *bodies* no longer live in the document —
 * they are files in the `threads/<id>/` store (see src/threads-store.ts). All the
 * document holds is the **anchor**: a `:mark[span]{#id}` inline directive or a
 * `:::mark{#id}…:::` container directive marking the highlighted span. This module
 * reads those anchors back out (to drive the sidebar / turn render) and unwraps
 * them (on resolve).
 *
 * Kept as plain regex over the markdown string (not a DOM parse) so the same code
 * runs in node tests, the browser GUI, and the dev server, and so it stays
 * cheap/greppable — the storage scheme is deliberately plain-text (see CLAUDE.md
 * portability aim).
 */

/** A comment anchor in the document: the thread id and its highlighted span. */
export interface Anchor {
  /** the id shared by the `:mark`/`:::mark` anchor and its `threads/<id>/` store */
  id: string;
  /** the text inside the anchor (the highlighted span); '' for a container anchor */
  text: string;
}

// `:mark[TEXT]{#ID}` — the inline comment anchor (a remark directive). Captures
// the inner text then the id. Non-greedy inner match so adjacent anchors on one
// line stay separate.
const MARK_RE = /:mark\[([\s\S]*?)\]\{#([^}]+)\}/g;

// `:::mark{#ID}` — the container (multi-block) anchor opener. Captures the id;
// the wrapped blocks are document content, not part of the anchor's own text.
const BLOCK_RE = /:::mark\{#([^}]+)\}/g;

/**
 * Extract the comment anchors from a docloop markdown document, one entry per id
 * in document order. A span broken by inline formatting serialises as several
 * same-id directives (see src/anchor.ts) — their text is coalesced so the anchor
 * reads as one highlighted span. Container anchors contribute their id with empty
 * text (their span is whole blocks, surfaced in the doc, not a short quote).
 */
export function extractAnchors(markdown: string): Anchor[] {
  // Collect every anchor occurrence in document order.
  const occ: { id: string; text: string; index: number }[] = [];
  for (const m of markdown.matchAll(MARK_RE)) {
    occ.push({ id: m[2], text: m[1], index: m.index ?? 0 });
  }
  for (const m of markdown.matchAll(BLOCK_RE)) {
    occ.push({ id: m[1], text: '', index: m.index ?? 0 });
  }
  occ.sort((a, b) => a.index - b.index);

  const anchors: Anchor[] = [];
  const byId = new Map<string, Anchor>();
  for (const o of occ) {
    const existing = byId.get(o.id);
    if (existing) {
      if (o.text) existing.text = existing.text ? `${existing.text} ${o.text}` : o.text;
      continue;
    }
    const anchor: Anchor = { id: o.id, text: o.text };
    byId.set(o.id, anchor);
    anchors.push(anchor);
  }
  return anchors;
}

/** Escape a thread id for safe use inside a RegExp. */
function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Unwrap a single thread's anchor back to plain text, leaving the document
 * content intact: inline `:mark[TEXT]{#id}` → `TEXT`, container
 * `:::mark{#id}\nBLOCKS\n:::` → `BLOCKS`. Other anchors are left untouched. Used
 * by "resolve" (the store directory is deleted separately).
 */
export function unwrapAnchor(markdown: string, id: string): string {
  const esc = reEscape(id);
  // The inline closer `]{#id}` is id-SPECIFIC, so a naive `[\s\S]*?` body would
  // cross earlier anchors (whose `]{#otherId}` don't terminate it) and swallow
  // them up to this id's closer. The tempered `(?:(?!\]\{#)[\s\S])*` body refuses
  // to cross any `]{#` boundary, so a match can only start at THIS anchor's own
  // `:mark[`. (Container openers are already id-specific, so they need no guard.)
  return markdown
    .replace(new RegExp(`:mark\\[((?:(?!\\]\\{#)[\\s\\S])*)\\]\\{#${esc}\\}`, 'g'), '$1')
    .replace(new RegExp(`:::mark\\{#${esc}\\}\\n([\\s\\S]*?)\\n:::`, 'g'), '$1');
}

/**
 * Strip every comment anchor back to its plain text — inline `:mark[TEXT]{#id}`
 * → `TEXT`, container `:::mark{#id}\nBLOCKS\n:::` → `BLOCKS`. The whole-document
 * counterpart to {@link unwrapAnchor} (which targets one id). Used wherever a diff
 * should see document *content* without anchor scaffolding (the turn render and
 * the Changes panel), so opening/closing a thread never registers as an edit.
 */
export function stripAnchors(markdown: string): string {
  return markdown
    .replace(/:mark\[([\s\S]*?)\]\{#[^}]+\}/g, '$1')
    .replace(/:::mark\{#[^}]+\}\n([\s\S]*?)\n:::/g, '$1');
}

/** Matches a `t<N>` thread id and captures the numeric suffix. */
const ID_RE = /^t(\d+)$/;

/**
 * Next sequential id of the form `t<N>` given the ids already in use: max numeric
 * suffix + 1, or `t1` if none qualify. The caller passes every id already in play
 * — both store thread ids AND anchor ids in the document — so a freshly applied
 * anchor never collides with one whose store directory doesn't exist yet (threads
 * are created lazily on the first reply). Ids that don't match `^t(\d+)$` are
 * ignored when computing the max; they can't collide with this scheme.
 */
export function nextThreadId(existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const m = ID_RE.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `t${max + 1}`;
}
