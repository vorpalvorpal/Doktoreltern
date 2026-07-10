/**
 * Browser ⇄ store bridge. The comment store (`threads/<id>/NNNN.md`) lives on the
 * filesystem, which the browser can't touch, so the GUI reaches it through the
 * dev-server `/threads` endpoints (see vite.config.ts). These thin wrappers are
 * the only place main.ts talks to the network for comments; they mirror the
 * shapes src/threads-store.ts persists.
 */

/** A comment as served by `/threads` (mirrors threads-store.ts `Comment`). */
export interface StoreComment {
  seq: number;
  author: string;
  created: string;
  body: string;
}

/** A thread as served by `/threads` (mirrors threads-store.ts `Thread`). */
export interface StoreThread {
  id: string;
  comments: StoreComment[];
}

/** GET /threads → every thread and its comments. */
export async function fetchThreads(): Promise<StoreThread[]> {
  const res = await fetch('/threads');
  const json = (await res.json()) as { ok: boolean; threads?: StoreThread[] };
  return json.ok && json.threads ? json.threads : [];
}

/**
 * POST /threads/<id> → append a comment to thread `id`, creating the thread
 * directory if it doesn't exist yet (the lazy-create path: highlighting a
 * span applies the anchor with a fresh id; the store thread appears on the
 * first reply here). Returns the created comment (its `seq` is what the
 * compose box's `draftSeq` tracks for later amending).
 */
export async function replyThread(id: string, body: string, author = 'rjs'): Promise<StoreComment> {
  const res = await fetch(`/threads/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author, body }),
  });
  const json = (await res.json()) as { ok: boolean; comment: StoreComment };
  return json.comment;
}

/**
 * PUT /threads/<id>/<seq> → amend an existing comment's body in place. Used
 * by the compose box's blur-driven upsert to amend a still-in-progress draft
 * rather than stacking a new comment on every blur.
 */
export async function updateComment(id: string, seq: number, body: string): Promise<void> {
  await fetch(`/threads/${encodeURIComponent(id)}/${seq}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

/**
 * DELETE /threads/<id> → resolve the thread: unwraps the anchor server-side
 * concern is the caller's; this writes the `resolved.md` marker (spec
 * decision 9) authored by the human side.
 */
export async function resolveThread(id: string): Promise<void> {
  await fetch(`/threads/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author: 'rjs' }),
  });
}
