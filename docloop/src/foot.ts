/**
 * Foot-region thread operations — the pure-markdown core behind the M2 write
 * actions (add comment / reply / resolve). The `<mark>` anchor in the body is
 * applied/removed by the editor (a ProseMirror mark, see src/comment-mark.ts);
 * these helpers manage the `<article data-thread="id">…</article>` thread bodies
 * that live below the final `---`.
 *
 * ## Thread-body storage format (single-line, `<br>`-separated)
 * Each thread is ONE `<article>` on ONE physical line; multiple replies inside it
 * are joined with `<br>`:
 *
 *     <article data-thread="t1">first reply<br>second reply<br>third reply</article>
 *
 * Why single-line + `<br>` rather than multi-line raw HTML: a *multi-line*
 * `<article>` body does NOT round-trip byte-stably through Milkdown's serializer.
 * Verified during M2 — a blank line between replies makes remark-stringify inject
 * extra trailing `\n\n` before `</article>`, so the stored form drifts on every
 * save and `extractThreads`'s body capture would accrete whitespace. The
 * single-line `<br>` form round-trips byte-clean AND idempotently (proven against
 * the M0 path), stays greppable, and keeps `extractThreads`'s `[\s\S]*?` body
 * match intact. The cost is that literal newlines in a reply are encoded as
 * `<br>`; replies are short review notes, so that is acceptable.
 *
 * These functions are pure string transforms (no DOM) so the same code runs in
 * node tests and the browser — matching threads.ts and the CLAUDE.md portability
 * aim (plain-text, greppable storage).
 */

/** Separator between replies inside one `<article>` body. */
const REPLY_SEP = '<br>';

/** Does the doc already have a `---` foot-region delimiter line? */
function hasFootRegion(md: string): boolean {
  return /^---\s*$/m.test(md);
}

/** Build one article element from a body string (already `<br>`-joined). */
function articleEl(id: string, body: string): string {
  return `<article data-thread="${id}">${body}</article>`;
}

/** Escape a thread id for safe use inside a RegExp. */
function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match a specific thread's `<article …id…>body</article>` (non-greedy body). */
function articleReFor(id: string): RegExp {
  return new RegExp(`<article\\s+data-thread="${reEscape(id)}">([\\s\\S]*?)</article>`);
}

/**
 * Add a new thread body to the foot-region (below the last `---`), creating the
 * `---` delimiter + foot-region if it doesn't exist yet. The body is a single
 * reply (no separators); use {@link appendReply} to add more.
 */
export function addThread(md: string, id: string, body: string): string {
  const article = articleEl(id, body);
  const trimmed = md.replace(/\s+$/, ''); // drop trailing whitespace for clean joins

  if (!hasFootRegion(md)) {
    // Create the foot-region: blank line, the `---` delimiter, blank line, article.
    return `${trimmed}\n\n---\n\n${article}\n`;
  }
  // Reuse the existing foot-region: append the new article on its own line after
  // whatever is already there (the delimiter is untouched, so it stays unique).
  return `${trimmed}\n${article}\n`;
}

/**
 * Append a reply to an existing thread's `<article>` body, keeping what's there.
 * Replies are joined with `<br>`. If the thread has no `<article>` yet (an orphan
 * anchor), one is created in the foot-region.
 */
export function appendReply(md: string, id: string, reply: string): string {
  const re = articleReFor(id);
  const m = re.exec(md);
  if (!m) {
    // No existing body — start one.
    return addThread(md, id, reply);
  }
  const existingBody = m[1];
  const newBody = existingBody.length ? `${existingBody}${REPLY_SEP}${reply}` : reply;
  return md.replace(re, articleEl(id, newBody));
}

/**
 * Resolve/remove a thread: unwrap its `:mark[…]{#id}` / `:::mark{#id}` anchor in
 * the body back to plain text, and delete its `<article>` from the foot-region.
 * Other threads are left untouched.
 */
export function removeThread(md: string, id: string): string {
  const esc = reEscape(id);
  let out = md;

  // 1. Unwrap the anchor back to plain text. Inline `:mark[TEXT]{#id}` -> `TEXT`;
  //    container `:::mark{#id}\nBLOCKS\n:::` -> `BLOCKS`.
  const inlineRe = new RegExp(`:mark\\[([\\s\\S]*?)\\]\\{#${esc}\\}`, 'g');
  out = out.replace(inlineRe, '$1');
  const blockRe = new RegExp(`:::mark\\{#${esc}\\}\\n([\\s\\S]*?)\\n:::`, 'g');
  out = out.replace(blockRe, '$1');

  // 2. Delete the article line entirely. Match the article plus an optional
  //    trailing newline so we don't leave a blank gap where it stood.
  const articleRe = new RegExp(
    `<article\\s+data-thread="${esc}">[\\s\\S]*?</article>\\n?`,
    'g',
  );
  out = out.replace(articleRe, '');

  return out;
}
