/**
 * docloop read/write view entry point.
 *
 * The editor's ProseMirror doc is the source of truth for the *document* (prose +
 * `:mark` anchors); comment **bodies** live in the sidecar `/threads` store. This
 * wires the two together:
 *
 *   - the diff vs a mutable BASELINE painted as ProseMirror decorations (green
 *     inserts, red delete widgets) + the comment-anchor highlights — re-derived
 *     after every action,
 *   - a threads sidebar: each document anchor joined with its store comments
 *     (rendered via a read-only Milkdown instance), a reply box, and a Resolve
 *     control,
 *   - an "Add comment" button that anchors a comment on the current selection,
 *   - a "Changes" panel listing each diff hunk with Accept / Reject controls.
 *
 * Document mutations go through the M0 serialise→transform→reload path; comment
 * mutations go through the `/threads` endpoints (src/threads-client.ts), with an
 * in-memory fallback so the bundled demo still works with no dev server.
 */
import { DecorationSet } from '@milkdown/prose/view';
import { createEditor, type DocloopEditor } from './editor';
import { buildReadViewDecorations } from './decorations';
import { decorationPlugin, decoPluginKey } from './deco-plugin';
import { extractAnchors, nextThreadId, type Anchor } from './threads';
import {
  applyAnchor,
  removeAnchor,
  currentMarkdown,
  loadMarkdown,
  hasTextSelection,
} from './write-actions';
import {
  fetchThreads,
  replyThread,
  resolveThread,
  type StoreThread,
} from './threads-client';
import { listContentHunks, acceptHunk, rejectHunk, type Hunk } from './hunks';
import { OLD_MD, NEW_MD, SAMPLE_THREADS } from './sample';

/** Mutable app state: the editor, the diff baseline, and the cached store. */
interface App {
  ed: DocloopEditor;
  baselineMd: string;
  /** comment store, cached from `/threads` (or SAMPLE_THREADS offline) */
  threads: StoreThread[];
  /** whether the `/threads` endpoint is live (else mutate `threads` in-memory) */
  usingStore: boolean;
  /** read-only Milkdown instances rendering comment bodies, torn down each render */
  commentEditors: DocloopEditor[];
  els: {
    threads: HTMLElement;
    changes: HTMLElement;
    addBtn: HTMLButtonElement;
  };
  /** thread id whose reply box should grab focus after the next render */
  focusReplyFor: string | null;
}

/**
 * Load the document + diff baseline. Prefers the live git workspace via `GET
 * /doc`; falls back to the bundled sample when no workspace exists yet.
 */
async function loadState(): Promise<{ current: string; baseline: string }> {
  try {
    const res = await fetch('/doc');
    const json = (await res.json()) as {
      ok: boolean;
      present?: boolean;
      current?: string;
      baseline?: string | null;
    };
    if (json.ok && json.present && typeof json.current === 'string') {
      // No prior commit -> baseline == current, so nothing diffs (correct).
      return { current: json.current, baseline: json.baseline ?? json.current };
    }
  } catch {
    // No dev server / endpoint — fall through to the sample.
  }
  return { current: NEW_MD, baseline: OLD_MD };
}

/**
 * Load the comment store. Prefers the live `/threads` endpoint; falls back to the
 * bundled SAMPLE_THREADS (and `usingStore: false`, so later mutations stay
 * in-memory) when no dev server is reachable.
 */
async function loadThreads(): Promise<{ threads: StoreThread[]; usingStore: boolean }> {
  try {
    return { threads: await fetchThreads(), usingStore: true };
  } catch {
    return { threads: SAMPLE_THREADS, usingStore: false };
  }
}

async function main(): Promise<void> {
  const editorRoot = document.getElementById('editor');
  const threadList = document.getElementById('threads');
  const changes = document.getElementById('changes');
  const addBtn = document.getElementById('add-comment') as HTMLButtonElement | null;
  if (!editorRoot || !threadList || !changes || !addBtn) {
    throw new Error('missing #editor / #threads / #changes / #add-comment');
  }

  const { current, baseline } = await loadState();
  const { threads, usingStore } = await loadThreads();

  const ed = await createEditor(editorRoot, current, {
    editable: true,
    plugins: [decorationPlugin(DecorationSet.empty)],
  });

  const app: App = {
    ed,
    baselineMd: baseline,
    threads,
    usingStore,
    commentEditors: [],
    els: { threads: threadList, changes, addBtn },
    focusReplyFor: null,
  };

  // "Add comment" is enabled only when there's a span to anchor on.
  const syncAddBtn = () => {
    addBtn.disabled = !hasTextSelection(ed);
  };
  ed.view.dom.addEventListener('mouseup', syncAddBtn);
  ed.view.dom.addEventListener('keyup', syncAddBtn);
  syncAddBtn();

  addBtn.addEventListener('click', () => {
    // Allocate an id free across BOTH the store and the document's anchors, since
    // the store thread is created lazily on the first reply.
    const inUse = [
      ...app.threads.map((t) => t.id),
      ...extractAnchors(currentMarkdown(app.ed)).map((a) => a.id),
    ];
    const id = nextThreadId(inUse);
    if (!applyAnchor(app.ed, id)) return; // no selection (button should be disabled)
    app.focusReplyFor = id; // focus its reply box once the sidebar re-renders
    void rerender(app);
  });

  const commitBtn = document.getElementById('commit') as HTMLButtonElement | null;
  if (commitBtn) wireCommit(ed, commitBtn);

  // "Reload" pulls the latest committed doc (e.g. after Claude's turn) and the
  // latest store, then re-derives the view against the previous commit.
  const reloadBtn = document.getElementById('reload') as HTMLButtonElement | null;
  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      reloadBtn.disabled = true;
      try {
        const next = await loadState();
        loadMarkdown(app.ed, next.current);
        app.baselineMd = next.baseline;
        if (app.usingStore) app.threads = await fetchThreads();
        await rerender(app);
      } finally {
        reloadBtn.disabled = false;
      }
    });
  }

  await rerender(app);
}

/**
 * Commit the current document state to the workspace git repo (commit == turn).
 * Serialises the live doc via the M0 path and POSTs it to `/commit`, which renders
 * the turn (reading the store) and git-commits the doc.
 */
function wireCommit(ed: DocloopEditor, btn: HTMLButtonElement): void {
  const label = btn.textContent;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Committing…';
    try {
      const res = await fetch('/commit', { method: 'POST', body: currentMarkdown(ed) });
      const json = (await res.json()) as { ok: boolean; committed?: boolean; commit?: string };
      btn.textContent = !json.ok
        ? 'Commit failed'
        : json.committed
          ? `Committed ${json.commit}`
          : 'No changes';
    } catch {
      btn.textContent = 'Commit failed';
    } finally {
      window.setTimeout(() => {
        btn.textContent = label;
        btn.disabled = false;
      }, 2500);
    }
  });
}

/** Append a comment to a thread, via the store or (offline) in-memory. */
async function postReply(app: App, id: string, body: string): Promise<void> {
  if (app.usingStore) {
    await replyThread(id, body);
    app.threads = await fetchThreads();
    return;
  }
  // Offline demo: mutate the cached store so the sidebar still updates.
  const now = new Date().toISOString();
  const existing = app.threads.find((t) => t.id === id);
  if (existing) {
    const seq = existing.comments.length
      ? existing.comments[existing.comments.length - 1].seq + 1
      : 1;
    existing.comments.push({ seq, author: 'rjs', created: now, body });
  } else {
    app.threads.push({ id, comments: [{ seq: 1, author: 'rjs', created: now, body }] });
  }
}

/** Resolve a thread: drop its store directory, via the store or (offline) in-memory. */
async function deleteThread(app: App, id: string): Promise<void> {
  if (app.usingStore) {
    await resolveThread(id);
    app.threads = await fetchThreads();
  } else {
    app.threads = app.threads.filter((t) => t.id !== id);
  }
}

/** Re-derive decorations + sidebar + changes panel from the current state. */
async function rerender(app: App): Promise<void> {
  const { ed } = app;

  // 1. Decorations: diff live doc vs the (mutable) baseline + anchor highlights.
  const baselineDoc = ed.parse(app.baselineMd);
  const liveDoc = ed.view.state.doc;
  const set = buildReadViewDecorations(baselineDoc, liveDoc);
  ed.view.dispatch(ed.view.state.tr.setMeta(decoPluginKey, set));

  // 2. Sidebar (anchors joined with store comments) + 3. changes panel.
  const md = currentMarkdown(ed);
  await renderThreads(app, extractAnchors(md));
  // Content edits only — opening/closing a thread is not an approvable change.
  renderChanges(app, listContentHunks(app.baselineMd, md));
}

/** Render one comment body as a read-only Milkdown instance inside `host`. */
async function renderComment(app: App, host: HTMLElement, body: string): Promise<void> {
  const mount = document.createElement('div');
  mount.className = 'comment-body';
  host.appendChild(mount);
  const ed = await createEditor(mount, body, { editable: false });
  app.commentEditors.push(ed);
}

/**
 * Render the threads sidebar: each document anchor, its store comments (read-only
 * Milkdown), a reply box, and a Resolve button.
 */
async function renderThreads(app: App, anchors: Anchor[]): Promise<void> {
  // Tear down the previous render's comment editors before rebuilding.
  await Promise.all(app.commentEditors.map((e) => e.destroy()));
  app.commentEditors = [];

  const host = app.els.threads;
  host.replaceChildren();

  if (anchors.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = 'No comment threads.';
    host.appendChild(empty);
    return;
  }

  const byId = new Map(app.threads.map((t) => [t.id, t]));

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const li = document.createElement('li');
    li.className = 'thread';
    li.dataset.thread = a.id;

    const head = document.createElement('div');
    head.className = 'thread-head';

    const badge = document.createElement('span');
    badge.className = 'thread-badge';
    badge.textContent = String(i + 1);
    head.appendChild(badge);

    const anchorEl = document.createElement('span');
    anchorEl.className = 'thread-anchor';
    anchorEl.textContent = a.text ? `“${a.text}”` : '(block anchor)';
    head.appendChild(anchorEl);

    const resolveBtn = document.createElement('button');
    resolveBtn.className = 'btn btn-resolve';
    resolveBtn.textContent = 'Resolve';
    resolveBtn.title = 'Unwrap the anchor and delete this thread';
    resolveBtn.addEventListener('click', async () => {
      removeAnchor(app.ed, a.id); // document side
      await deleteThread(app, a.id); // store side
      await rerender(app);
    });
    head.appendChild(resolveBtn);
    li.appendChild(head);

    // Comment bodies (read-only Milkdown), in sequence order.
    const comments = byId.get(a.id)?.comments ?? [];
    const bodyHost = document.createElement('div');
    bodyHost.className = 'thread-body';
    li.appendChild(bodyHost);
    if (comments.length === 0) {
      const none = document.createElement('div');
      none.className = 'muted';
      none.textContent = '(no replies yet)';
      bodyHost.appendChild(none);
    } else {
      for (const c of comments) {
        const item = document.createElement('div');
        item.className = 'comment';
        const meta = document.createElement('span');
        meta.className = 'comment-meta';
        meta.textContent = c.author;
        item.appendChild(meta);
        bodyHost.appendChild(item);
        await renderComment(app, item, c.body);
      }
    }

    // Reply box.
    const form = document.createElement('form');
    form.className = 'reply-form';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Reply…';
    input.className = 'reply-input';
    form.appendChild(input);
    const send = document.createElement('button');
    send.type = 'submit';
    send.className = 'btn';
    send.textContent = 'Reply';
    form.appendChild(send);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      app.focusReplyFor = a.id;
      await postReply(app, a.id, text);
      await rerender(app);
    });
    li.appendChild(form);

    host.appendChild(li);

    if (app.focusReplyFor === a.id) input.focus();
  }

  app.focusReplyFor = null;
}

/** Render the per-hunk Accept / Reject controls. */
function renderChanges(app: App, hunks: Hunk[]): void {
  const host = app.els.changes;
  host.replaceChildren();

  if (hunks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = 'No pending changes.';
    host.appendChild(empty);
    return;
  }

  hunks.forEach((h) => {
    const li = document.createElement('li');
    li.className = `change change-${h.type}`;

    const label = document.createElement('span');
    label.className = 'change-label';
    const verb = h.type === 'insert' ? '+ ' : '− ';
    label.textContent = verb + h.value.trim();
    li.appendChild(label);

    const accept = document.createElement('button');
    accept.className = 'btn btn-accept';
    accept.textContent = 'Accept';
    accept.title = 'Keep this change (advance the baseline)';
    accept.addEventListener('click', () => {
      // Accept advances the baseline; the live doc is unchanged.
      app.baselineMd = acceptHunk(app.baselineMd, currentMarkdown(app.ed), h.index);
      void rerender(app);
    });
    li.appendChild(accept);

    const reject = document.createElement('button');
    reject.className = 'btn btn-reject';
    reject.textContent = 'Reject';
    reject.title = 'Revert this change in the document';
    reject.addEventListener('click', () => {
      // Reject rewrites the live doc back to the baseline for this span.
      const reverted = rejectHunk(app.baselineMd, currentMarkdown(app.ed), h.index);
      loadMarkdown(app.ed, reverted);
      void rerender(app);
    });
    li.appendChild(reject);

    host.appendChild(li);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  const editorRoot = document.getElementById('editor');
  if (editorRoot) editorRoot.textContent = `Failed to start: ${String(err)}`;
});
