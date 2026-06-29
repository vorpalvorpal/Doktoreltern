export interface Thread {
  /** the id shared by the `:mark`/`:::mark` anchor and its `<article>` body */
  id: string;
  /** the text inside the anchor (the highlighted span in the body) */
  anchor: string;
  /** the `<article>` foot-region body, or null for an orphan mark */
  body: string | null;
}

// `:mark[ANCHOR]{#ID}` — the inline comment anchor (a remark directive).
// Captures the inner text then the id. Non-greedy inner match so adjacent anchors
// on one line stay separate.
const MARK_RE = /:mark\[([\s\S]*?)\]\{#([^}]+)\}/g;

// `:::mark{#ID}` — the container (multi-block) anchor opener. Captures the id;
// the wrapped blocks are the body content, not needed for thread extraction.
const BLOCK_RE = /:::mark\{#([^}]+)\}/g;

// `<article data-thread="ID">BODY</article>` — the foot-region thread body.
const ARTICLE_RE = /<article\s+data-thread="([^"]+)">([\s\S]*?)<\/article>/g;

/**
 * Extract comment threads from a docloop markdown document:
 * `:mark[anchor]{#id}` / `:::mark{#id}` directive anchors joined, by id, with their
 * `<article data-thread="id">body</article>` foot-region bodies. Returns one
 * entry per id, in document order; an anchor with no matching `<article>`
 * yields `body: null`.
 *
 * Kept as plain regex over the markdown string (not a DOM parse) so the same
 * code runs in node tests and the browser, and so it stays cheap/greppable —
 * the storage scheme is deliberately plain-text (see CLAUDE.md portability aim).
 */
export function extractThreads(markdown: string): Thread[] {
  // Index article bodies by thread id for O(1) join. Last write wins if a id
  // somehow repeats (not expected; threads ids are unique).
  const bodies = new Map<string, string>();
  for (const m of markdown.matchAll(ARTICLE_RE)) {
    bodies.set(m[1], m[2]);
  }

  // Collect every anchor occurrence in document order: inline `:mark[…]{#id}`
  // anchors carry their span text; container `:::mark{#id}` openers carry none.
  const occ: { id: string; text: string; index: number }[] = [];
  for (const m of markdown.matchAll(MARK_RE)) {
    occ.push({ id: m[2], text: m[1], index: m.index ?? 0 });
  }
  for (const m of markdown.matchAll(BLOCK_RE)) {
    occ.push({ id: m[1], text: '', index: m.index ?? 0 });
  }
  occ.sort((a, b) => a.index - b.index);

  // One thread per id, first-seen order. A span broken by inline formatting
  // serialises as several same-id anchors (see src/anchor.ts) — coalesce their
  // text so the thread reads as one highlighted span.
  const threads: Thread[] = [];
  const byId = new Map<string, Thread>();
  for (const o of occ) {
    const existing = byId.get(o.id);
    if (existing) {
      if (o.text) existing.anchor = existing.anchor ? `${existing.anchor} ${o.text}` : o.text;
      continue;
    }
    const thread: Thread = {
      id: o.id,
      anchor: o.text,
      body: bodies.has(o.id) ? bodies.get(o.id)! : null,
    };
    byId.set(o.id, thread);
    threads.push(thread);
  }

  // Then append any thread that has an `<article>` body but no anchor in the
  // body — e.g. just after `addThread` runs but before/without an anchor, which
  // the M2 write flow can momentarily produce. Such a thread has `anchor: ''`.
  for (const [id, body] of bodies) {
    if (!byId.has(id)) threads.push({ id, anchor: '', body });
  }

  return threads;
}

/**
 * Split a thread body into its turns. Replies are stored `<br>`-joined (see
 * src/foot.ts), so a multi-reply thread shows as several lines; a thread with no
 * replies is a single turn. Tolerates `<br>`, `<br/>`, `<br />`; empty turns are
 * dropped.
 */
export function splitTurns(body: string): string[] {
  return body
    .split(/<br\s*\/?>/i)
    .map((turn) => turn.trim())
    .filter((turn) => turn.length > 0);
}
