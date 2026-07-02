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
 *   - highlighting a span auto-anchors a new thread on it (no "Add comment"
 *     button): the reply box opens focused, and abandoning it empty (blur with
 *     no text, or starting a new highlight elsewhere) drops the anchor again,
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
import { extractAnchors, nextThreadId, threadNumber, type Anchor } from './threads';
import {
  applyAnchor,
  removeAnchor,
  currentMarkdown,
  loadMarkdown,
  hasTextSelection,
  selectionOverlapsAnchor,
} from './write-actions';
import {
  fetchThreads,
  replyThread,
  resolveThread,
  type StoreThread,
} from './threads-client';
import { listChanges, rejectChange, type Change } from './changes';
import { OLD_MD, NEW_MD, SAMPLE_THREADS } from './sample';
import { createSerialQueue } from './serial-queue';

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
  /** UTC ISO of the previous turn's commit, or null — bounds "new this turn" */
  baselineIso: string | null;
  /** thread ids currently expanded; the rest are collapsed in the sidebar */
  expanded: Set<string>;
  /** expanded comment keys (`<threadId>#<seq>`); the rest are folded to a preview */
  expandedComments: Set<string>;
  /** change keys the user has accepted (marked reviewed) — hidden until commit */
  acceptedChanges: Set<string>;
  /** whether {@link initCollapse} has seeded the collapse state for this turn yet */
  collapseInitialized: boolean;
  els: {
    threads: HTMLElement;
  };
  /** thread id whose reply box should grab focus after the next render */
  focusReplyFor: string | null;
  /**
   * The thread id most recently auto-anchored from a highlight but not yet
   * confirmed with a first reply (see {@link autoAnchorFromSelection}). It has no
   * store entry yet — if its box is abandoned empty, the anchor is dropped again.
   */
  pendingThreadId: string | null;
}

/**
 * Load the document + diff baseline. Prefers the live git workspace via `GET
 * /doc`; falls back to the bundled sample when no workspace exists yet (no
 * dev server reachable, or `/doc` reports nothing present). `isSample` tells
 * the caller which happened, so a fallback can be shown clearly rather than
 * silently looking like the real document — a stale dev-server process is a
 * common cause (Vite doesn't hot-reload `vite.config.ts` plugin edits).
 */
async function loadState(): Promise<{
  current: string;
  baseline: string;
  baselineIso: string | null;
  isSample: boolean;
}> {
  try {
    const res = await fetch('/doc');
    const json = (await res.json()) as {
      ok: boolean;
      present?: boolean;
      current?: string;
      baseline?: string | null;
      baselineIso?: string | null;
    };
    if (json.ok && json.present && typeof json.current === 'string') {
      // No prior commit -> baseline == current, so nothing diffs (correct).
      return {
        current: json.current,
        baseline: json.baseline ?? json.current,
        baselineIso: json.baselineIso ?? null,
        isSample: false,
      };
    }
  } catch {
    // No dev server / endpoint — fall through to the sample.
  }
  return { current: NEW_MD, baseline: OLD_MD, baselineIso: null, isSample: true };
}

/** Show/hide the "showing the bundled sample" banner (see index.html). */
function setSampleBannerVisible(visible: boolean): void {
  document.getElementById('sample-banner')?.toggleAttribute('hidden', !visible);
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
  if (!editorRoot || !threadList) {
    throw new Error('missing #editor / #threads');
  }

  const { current, baseline, baselineIso, isSample } = await loadState();
  const { threads, usingStore } = await loadThreads();
  setSampleBannerVisible(isSample);

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
    baselineIso,
    expanded: new Set(),
    expandedComments: new Set(),
    acceptedChanges: new Set(),
    collapseInitialized: false,
    els: { threads: threadList },
    focusReplyFor: null,
    pendingThreadId: null,
  };

  // Highlighting a span auto-anchors a new thread on it (see autoAnchorFromSelection).
  ed.view.dom.addEventListener('mouseup', () => autoAnchorFromSelection(app));
  ed.view.dom.addEventListener('keyup', () => autoAnchorFromSelection(app));

  const commitBtn = document.getElementById('commit') as HTMLButtonElement | null;
  if (commitBtn) wireCommit(app, commitBtn);

  const saveDraftBtn = document.getElementById('save-draft') as HTMLButtonElement | null;
  if (saveDraftBtn) wireSaveDraft(app, saveDraftBtn);

  // "Reload" pulls the latest committed doc (e.g. after Claude's turn) and the
  // latest store, then re-derives the view against the previous commit.
  const reloadBtn = document.getElementById('reload') as HTMLButtonElement | null;
  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      reloadBtn.disabled = true;
      try {
        const next = await loadState();
        setSampleBannerVisible(next.isSample);
        loadMarkdown(app.ed, next.current);
        app.baselineMd = next.baseline;
        app.baselineIso = next.baselineIso;
        if (app.usingStore) app.threads = await fetchThreads();
        // Re-seed collapse for the freshly-loaded turn (expand its new threads).
        app.collapseInitialized = false;
        await rerender(app);
      } finally {
        reloadBtn.disabled = false;
      }
    });
  }

  // Clicking an in-text badge jumps to its thread and opens the reply box.
  ed.view.dom.addEventListener('click', (e) => {
    const badge = (e.target as HTMLElement).closest?.('.docloop-badge');
    const id = badge?.getAttribute('data-thread');
    if (id) {
      e.preventDefault();
      void focusThread(app, id);
    }
  });

  await rerender(app);

  // Re-layout the margin gutter when the doc reflows (typing, wrapping, font
  // load) or the window resizes — anchor positions move, cards must follow.
  // Attached AFTER the first render so the observer can't fire mid-render.
  new ResizeObserver(() => scheduleLayout(app)).observe(ed.view.dom);
  window.addEventListener('resize', () => scheduleLayout(app));
}

/**
 * Auto-anchor a new thread on the current selection (replaces an explicit "Add
 * comment" button): any highlight becomes a thread, its reply box opening
 * focused. Guards against re-anchoring text that's already commented, and
 * against firing repeatedly for the same settled selection (mouseup fires once
 * per drag, but keyup can re-fire while extending a selection with the
 * keyboard — {@link selectionOverlapsAnchor} short-circuits once this exact span
 * is already wrapped by the anchor we just applied).
 *
 * A previously pending (unconfirmed — no reply yet) thread is abandoned the
 * moment a *different* highlight starts: its anchor is removed only AFTER the
 * new one is safely applied, because removal round-trips through
 * serialise→reload (see {@link removeAnchor}) which would otherwise reset the
 * live selection before it could be anchored.
 */
function autoAnchorFromSelection(app: App): void {
  if (!hasTextSelection(app.ed)) return;
  if (selectionOverlapsAnchor(app.ed)) return;

  // Allocate an id free across BOTH the store and the document's anchors, since
  // the store thread is created lazily on the first reply.
  const inUse = [
    ...app.threads.map((t) => t.id),
    ...extractAnchors(currentMarkdown(app.ed)).map((a) => a.id),
  ];
  const id = nextThreadId(inUse);
  if (!applyAnchor(app.ed, id)) return; // no selection after all (race) — no-op

  const previousPending = app.pendingThreadId;
  app.pendingThreadId = id;
  app.expanded.add(id); // a thread you just opened starts expanded
  app.focusReplyFor = id; // focus its reply box once the sidebar re-renders
  if (previousPending && previousPending !== id) {
    app.expanded.delete(previousPending);
    removeAnchor(app.ed, previousPending);
  }
  void rerender(app);
}

/**
 * Drop a pending (unconfirmed) thread's anchor entirely — its box was abandoned
 * empty, or it's being superseded by a commit/save that must not persist a
 * comment-less highlight. Does not touch the store: a pending thread never had
 * an entry there (created lazily on the first reply).
 */
function dropPendingThread(app: App, id: string): void {
  app.expanded.delete(id);
  if (app.pendingThreadId === id) app.pendingThreadId = null;
  removeAnchor(app.ed, id);
}

/**
 * Settle any still-pending thread before the doc is serialised for hand-off
 * (commit or save-draft) — an anchor with no comment behind it must never be
 * persisted to disk.
 */
async function settlePending(app: App): Promise<void> {
  const id = app.pendingThreadId;
  if (!id) return;
  dropPendingThread(app, id);
  await rerender(app);
}

/**
 * Commit the current document state to the workspace git repo (commit == turn).
 * Serialises the live doc via the M0 path and POSTs it to `/commit`, which renders
 * the turn (reading the store) and git-commits the doc.
 */
function wireCommit(app: App, btn: HTMLButtonElement): void {
  const label = btn.textContent;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Committing…';
    try {
      await settlePending(app);
      const res = await fetch('/commit', { method: 'POST', body: currentMarkdown(app.ed) });
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

/**
 * Save the current document to the workspace working tree WITHOUT committing:
 * no git commit, no turn.xml render. Lets the human bank progress across
 * several sessions before one real "Hand to Claude" turn — see /save-draft in
 * vite.config.ts for why this is safe (the diff and Claude's turn view are
 * unaffected either way).
 */
function wireSaveDraft(app: App, btn: HTMLButtonElement): void {
  const label = btn.textContent;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await settlePending(app);
      const res = await fetch('/save-draft', { method: 'POST', body: currentMarkdown(app.ed) });
      const json = (await res.json()) as { ok: boolean };
      btn.textContent = json.ok ? 'Saved' : 'Save failed';
    } catch {
      btn.textContent = 'Save failed';
    } finally {
      window.setTimeout(() => {
        btn.textContent = label;
        btn.disabled = false;
      }, 2000);
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

/**
 * Serialises every call to {@link rerender} onto one queue, so overlapping
 * calls run one-after-another instead of racing. `rerender` is fired
 * `void`-style ("fire and forget") from most call sites (a highlight, a
 * click), and its body awaits several async steps (tearing down comment
 * editors, awaiting new ones) while mutating SHARED state
 * (`app.commentEditors`, `app.els.threads`'s DOM, `app.focusReplyFor`) — two
 * calls started close together used to run concurrently, and whichever
 * finished last would clobber whatever the other had just built (two rapid
 * highlights — a second thread created before the first's rerender had
 * settled — could leave the sidebar with zero threads rendered at all; see
 * `test/serial-queue.test.ts` for a deterministic reproduction of the
 * underlying race this queue closes).
 */
const renderQueue = createSerialQueue((err) => {
  // eslint-disable-next-line no-console
  console.error('rerender failed', err);
});

/** Re-derive decorations + the margin gutter (comment + change cards). */
function rerender(app: App): Promise<void> {
  return renderQueue(() => renderNow(app));
}

async function renderNow(app: App): Promise<void> {
  const { ed } = app;
  const baselineDoc = ed.parse(app.baselineMd);
  const liveDoc = ed.view.state.doc;

  // Changes = grouped text-content diff vs the baseline. Accepted ones are hidden.
  const changes = listChanges(baselineDoc, liveDoc);
  const acceptedRanges = changes
    .filter((c) => app.acceptedChanges.has(c.key))
    .map((c) => [c.from, c.to] as const);

  // 1. Decorations: diff (minus accepted spans) + anchor highlights.
  const set = buildReadViewDecorations(baselineDoc, liveDoc, acceptedRanges);
  ed.view.dispatch(ed.view.state.tr.setMeta(decoPluginKey, set));

  // 2. Rebuild the gutter: tear down old comment editors, then thread cards +
  // change cards (the still-pending changes).
  await Promise.all(app.commentEditors.map((e) => e.destroy()));
  app.commentEditors = [];
  app.els.threads.replaceChildren();
  await renderThreads(app, extractAnchors(currentMarkdown(ed)));
  renderChangeCards(app, changes.filter((c) => !app.acceptedChanges.has(c.key)));

  // 3. Position every card beside its anchor / change. renderThreads is awaited,
  // so the DOM is measurable now — lay out synchronously rather than racing a rAF.
  layoutGutter(app);
}

/** Pending rAF handle, so many layout triggers coalesce into one pass. */
let layoutPending = 0;

/** Re-position the gutter cards on the next frame (after the DOM has settled). */
function scheduleLayout(app: App): void {
  if (layoutPending) return;
  layoutPending = requestAnimationFrame(() => {
    layoutPending = 0;
    layoutGutter(app);
  });
}

/**
 * Margin layout: place every gutter card — comment threads AND change cards — at
 * its target's vertical position in the doc, but never above the previous card, so
 * cards stack downward and never overlap (the one whose target is higher wins the
 * spot; the next slides below it). A thread's target is its anchor highlight; a
 * change card's is its PM `from` position. The gutter (and so the sidebar's
 * dividing border) is grown to whichever is taller: the lowest card, or the main
 * document — never just stopping at the last comment. Re-run on every
 * open/close/expand/accept/resize.
 */
function layoutGutter(app: App): void {
  const gutter = app.els.threads;
  const sidebar = gutter.closest('.sidebar') as HTMLElement | null;
  if (!sidebar) return;

  const originTop = sidebar.getBoundingClientRect().top;
  const editorDom = app.ed.view.dom;
  const docBottom = Math.max(0, editorDom.getBoundingClientRect().bottom - originTop);

  const cards = Array.from(gutter.querySelectorAll<HTMLElement>('.thread, .change-card'));
  if (cards.length === 0) {
    sidebar.style.minHeight = `${docBottom}px`;
    return;
  }

  const yOf = (card: HTMLElement): number => {
    if (card.dataset.thread) {
      const id = card.dataset.thread;
      const el =
        editorDom.querySelector<HTMLElement>(`.docloop-mark[data-thread="${id}"]`) ??
        editorDom.querySelector<HTMLElement>(`.docloop-badge[data-thread="${id}"]`);
      return el ? el.getBoundingClientRect().top - originTop : Number.POSITIVE_INFINITY;
    }
    // change card: locate by its live-doc PM position.
    const from = Number(card.dataset.from);
    try {
      return app.ed.view.coordsAtPos(from).top - originTop;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };

  const placed = cards.map((card) => ({ card, y: yOf(card) })).sort((a, b) => a.y - b.y);

  const GAP = 8;
  let cursor = 0;
  for (const { card, y } of placed) {
    const top = Math.max(Number.isFinite(y) ? y : cursor, cursor);
    card.style.top = `${top}px`;
    cursor = top + card.offsetHeight + GAP;
  }
  sidebar.style.minHeight = `${Math.max(cursor, docBottom)}px`;
}

/**
 * Seed the collapse state for the just-loaded turn:
 *   - a **comment** starts open iff it is new this turn (created after the previous
 *     commit, `baselineIso`); every other comment folds to a one-line preview;
 *   - a **thread** starts open iff it was opened this turn (anchor new vs the
 *     baseline doc) or holds a new comment; otherwise it's collapsed to declutter.
 * Runs once per loaded turn; user toggles and later mutations are preserved because
 * rerender doesn't re-seed (the Reload handler clears the flag).
 */
function initCollapse(app: App, anchors: Anchor[]): void {
  app.expanded = new Set();
  app.expandedComments = new Set();
  const sinceMs = app.baselineIso ? Date.parse(app.baselineIso) : NaN;
  const isNew = (c: { created: string }) =>
    !Number.isNaN(sinceMs) && Date.parse(c.created) > sinceMs;
  const prevIds = new Set(extractAnchors(app.baselineMd).map((a) => a.id));
  const commentsById = new Map(app.threads.map((t) => [t.id, t.comments]));
  for (const a of anchors) {
    const comments = commentsById.get(a.id) ?? [];
    for (const c of comments) if (isNew(c)) app.expandedComments.add(`${a.id}#${c.seq}`);
    const opened = !prevIds.has(a.id);
    if (opened || comments.some(isNew)) app.expanded.add(a.id);
  }
  app.collapseInitialized = true;
}

/**
 * Focus a thread from an in-text badge click: open the thread, unfold its most
 * recent comment (the one you'd be replying to), focus the reply box, and scroll
 * the card into view.
 */
async function focusThread(app: App, id: string): Promise<void> {
  app.expanded.add(id);
  const comments = app.threads.find((t) => t.id === id)?.comments ?? [];
  if (comments.length) app.expandedComments.add(`${id}#${comments[comments.length - 1].seq}`);
  app.focusReplyFor = id;
  await rerender(app);
  app.els.threads
    .querySelector(`.thread[data-thread="${id}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  // The gutter is cleared and comment editors torn down by the caller (rerender).
  const host = app.els.threads;
  if (anchors.length === 0) return;

  // First render of a loaded turn: decide which threads start expanded.
  if (!app.collapseInitialized) initCollapse(app, anchors);

  const byId = new Map(app.threads.map((t) => [t.id, t]));

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const li = document.createElement('li');
    li.className = 'thread';
    li.dataset.thread = a.id;
    const collapsed = !app.expanded.has(a.id);
    if (collapsed) li.classList.add('collapsed');

    const head = document.createElement('div');
    head.className = 'thread-head';
    head.title = 'Click to expand / collapse';

    const caret = document.createElement('span');
    caret.className = 'thread-caret';
    caret.textContent = collapsed ? '▸' : '▾';
    head.appendChild(caret);

    const badge = document.createElement('span');
    badge.className = 'thread-badge';
    badge.textContent = threadNumber(a.id); // same source as the in-text badge
    head.appendChild(badge);

    const anchorEl = document.createElement('span');
    anchorEl.className = 'thread-anchor';
    anchorEl.textContent = a.text ? `“${a.text}”` : '(block anchor)';
    head.appendChild(anchorEl);

    const comments = byId.get(a.id)?.comments ?? [];
    const count = document.createElement('span');
    count.className = 'thread-count';
    count.textContent = comments.length ? `💬 ${comments.length}` : '—';
    head.appendChild(count);

    const resolveBtn = document.createElement('button');
    resolveBtn.className = 'btn btn-resolve';
    resolveBtn.textContent = 'Resolve';
    resolveBtn.title = 'Unwrap the anchor and delete this thread';
    resolveBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // don't also toggle collapse
      if (app.pendingThreadId === a.id) app.pendingThreadId = null; // no longer pending
      removeAnchor(app.ed, a.id); // document side
      await deleteThread(app, a.id); // store side
      await rerender(app);
    });
    head.appendChild(resolveBtn);

    // Toggle collapse on header click — a pure DOM/CSS flip, no re-render (so the
    // comment editors are never torn down and rebuilt just to fold a thread).
    head.addEventListener('click', () => {
      const nowCollapsed = li.classList.toggle('collapsed');
      caret.textContent = nowCollapsed ? '▸' : '▾';
      if (nowCollapsed) app.expanded.delete(a.id);
      else app.expanded.add(a.id);
      scheduleLayout(app); // height changed → restack the gutter
    });
    li.appendChild(head);

    // Comment bodies (read-only Milkdown), in sequence order.
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
        const key = `${a.id}#${c.seq}`;
        const cCollapsed = !app.expandedComments.has(key);
        const item = document.createElement('div');
        item.className = cCollapsed ? 'comment collapsed' : 'comment';
        bodyHost.appendChild(item);

        // Comment header: caret + author + a one-line preview (shown collapsed).
        const cHead = document.createElement('div');
        cHead.className = 'comment-head';
        cHead.title = 'Click to expand / collapse this comment';
        const cCaret = document.createElement('span');
        cCaret.className = 'comment-caret';
        cCaret.textContent = cCollapsed ? '▸' : '▾';
        cHead.appendChild(cCaret);
        const meta = document.createElement('span');
        meta.className = 'comment-meta';
        meta.textContent = c.author;
        cHead.appendChild(meta);
        const preview = document.createElement('span');
        preview.className = 'comment-preview';
        preview.textContent = c.body.replace(/\s+/g, ' ').trim().slice(0, 80);
        cHead.appendChild(preview);
        item.appendChild(cHead);

        // Comment body (read-only Milkdown), hidden while the comment is folded.
        const cBody = document.createElement('div');
        cBody.className = 'comment-body-host';
        item.appendChild(cBody);
        await renderComment(app, cBody, c.body);

        cHead.addEventListener('click', () => {
          const nc = item.classList.toggle('collapsed');
          cCaret.textContent = nc ? '▸' : '▾';
          if (nc) app.expandedComments.delete(key);
          else app.expandedComments.add(key);
          scheduleLayout(app); // height changed → restack the gutter
        });
      }
    }

    // Reply / initial-comment box: an auto-growing textarea (rows grow with the
    // comment rather than scrolling a single line). Enter submits; Shift+Enter
    // inserts a newline.
    const form = document.createElement('form');
    form.className = 'reply-form';
    const input = document.createElement('textarea');
    input.rows = 1;
    input.placeholder = 'Reply…';
    input.className = 'reply-input';
    form.appendChild(input);
    const send = document.createElement('button');
    send.type = 'submit';
    send.className = 'btn';
    send.textContent = 'Reply';
    form.appendChild(send);

    const autoGrow = () => {
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
    };
    input.addEventListener('input', () => {
      autoGrow();
      scheduleLayout(app); // height changed → restack the gutter
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    // A freshly auto-anchored thread (from highlighting) has no store entry yet
    // — abandoning its box empty must drop the anchor, not leave a dangling
    // highlight with nothing behind it.
    input.addEventListener('blur', () => {
      if (app.pendingThreadId === a.id && input.value.trim() === '') {
        dropPendingThread(app, a.id);
        void rerender(app);
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      if (app.pendingThreadId === a.id) app.pendingThreadId = null; // confirmed
      app.expanded.add(a.id); // keep it open across the re-render
      app.focusReplyFor = a.id;
      await postReply(app, a.id, text);
      await rerender(app);
    });
    li.appendChild(form);

    host.appendChild(li);

    if (app.focusReplyFor === a.id) {
      input.focus();
      autoGrow();
    }
  }

  app.focusReplyFor = null;
}

/**
 * Render a change card per pending change, into the margin gutter (positioned by
 * layoutGutter beside the change). Accept marks it reviewed (hidden until commit);
 * Reject reverts the span in the live doc.
 */
function renderChangeCards(app: App, changes: Change[]): void {
  const host = app.els.threads;
  for (const c of changes) {
    const li = document.createElement('li');
    li.className = `change-card change-${c.type}`;
    li.dataset.from = String(c.from);

    const label = document.createElement('div');
    label.className = 'change-label';
    if (c.type === 'insert') {
      label.textContent = `+ ${c.newValue.trim()}`;
    } else if (c.type === 'delete') {
      label.textContent = `− ${c.oldValue.trim()}`;
    } else {
      const del = document.createElement('span');
      del.className = 'change-del-text';
      del.textContent = c.oldValue.trim();
      const ins = document.createElement('span');
      ins.className = 'change-ins-text';
      ins.textContent = c.newValue.trim();
      label.append(del, document.createTextNode(' → '), ins);
    }
    li.appendChild(label);

    const controls = document.createElement('div');
    controls.className = 'change-controls';
    const accept = document.createElement('button');
    accept.className = 'btn btn-accept';
    accept.textContent = 'Accept';
    accept.title = 'Mark reviewed — keep this change (hidden until you commit)';
    accept.addEventListener('click', () => {
      app.acceptedChanges.add(c.key);
      void rerender(app);
    });
    const reject = document.createElement('button');
    reject.className = 'btn btn-reject';
    reject.textContent = 'Reject';
    reject.title = 'Revert this change in the document';
    reject.addEventListener('click', () => {
      rejectChange(app.ed.view, c);
      void rerender(app);
    });
    controls.append(accept, reject);
    li.appendChild(controls);

    host.appendChild(li);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  const editorRoot = document.getElementById('editor');
  if (editorRoot) editorRoot.textContent = `Failed to start: ${String(err)}`;
});
