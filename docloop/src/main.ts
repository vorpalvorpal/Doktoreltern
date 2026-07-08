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
 *     (rendered via a read-only Milkdown instance), a compose box, and a
 *     Resolve control,
 *   - highlighting a span auto-anchors a new thread on it (no "Add comment"
 *     button) and activates its compose box — a single live, editable
 *     Milkdown instance shared app-wide (every other thread's slot is a cheap
 *     placeholder). There's no submit button: blurring the box amends the
 *     draft comment in place (or creates it, or abandons the anchor if left
 *     empty with nothing else behind it) until Save-draft/Commit seals it —
 *     see {@link deactivateCompose} / {@link sealDrafts},
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
  isDocEmpty,
} from './write-actions';
import {
  fetchThreads,
  replyThread,
  updateComment,
  resolveThread,
  type StoreThread,
  type StoreComment,
} from './threads-client';
import { listChanges, rejectChange, type Change } from './changes';
import { OLD_MD, NEW_MD, SAMPLE_THREADS } from './sample';
import { createSerialQueue } from './serial-queue';
import { fetchSkills, runSkill, type SkillMeta } from './skills-client';
import { slashMenuPlugin } from './slash-menu-plugin';
import { loadDraft, saveDraft, clearDraft } from './draft-store';

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
  /**
   * Which thread (if any) owns the one live, editable compose instance —
   * only one exists app-wide at a time; every other thread's compose slot is
   * a cheap placeholder. Set by highlighting a new span, clicking a
   * placeholder, or the badge-click focus path; cleared on blur.
   */
  composeThreadId: string | null;
  /** The live editable compose instance for `composeThreadId`, if any — torn down on every rerender (see renderNow), tracked separately from the read-only `commentEditors`. */
  composeEditor: DocloopEditor | null;
  /**
   * Thread id → comment seq that's still amendable *this browser session*.
   * Blurring the compose box with content amends this seq in place (rather
   * than stacking a new comment) until Save-draft/Commit seals it (clearing
   * this map). No entry yet = nothing saved for this thread this session
   * (a freshly auto-anchored thread starts here — folds the old
   * `pendingThreadId` concept into this same map, since "pending" was always
   * just "no draft yet").
   */
  draftSeq: Map<string, number>;
  /** The docloop plugin's skill roster, fetched once at startup — the slash-trigger dropdown's source list. */
  skillCommands: SkillMeta[];
  /**
   * Client-side unsaved-edit safety net (see draft-store.ts). `name` keys the
   * localStorage draft per doc; `base` is the last server-persisted markdown the
   * autosave diffs against (updated on load, Reload, and a successful
   * Save/Commit). null on the bundled sample (no server → nothing to protect).
   */
  draft: { name: string; base: string } | null;
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
  name: string | null;
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
      name?: string;
      current?: string;
      baseline?: string | null;
      baselineIso?: string | null;
    };
    if (json.ok && json.present && typeof json.current === 'string') {
      // No prior commit -> baseline == current, so nothing diffs (correct).
      return {
        name: json.name ?? null,
        current: json.current,
        baseline: json.baseline ?? json.current,
        baselineIso: json.baselineIso ?? null,
        isSample: false,
      };
    }
  } catch {
    // No dev server / endpoint — fall through to the sample.
  }
  return { name: null, current: NEW_MD, baseline: OLD_MD, baselineIso: null, isSample: true };
}

/**
 * Persist the live doc to localStorage — the unsaved-edit safety net
 * (draft-store.ts). No-op offline (no `app.draft`). Called on a debounce while
 * editing and, crucially, on `beforeunload` (which fires even for Vite's own
 * `location.reload()` when it restarts the dev server), so the exact pre-reload
 * state is captured and can be restored instead of silently lost.
 */
function autosaveDraft(app: App): void {
  if (!app.draft) return;
  saveDraft(window.localStorage, app.draft.name, app.draft.base, currentMarkdown(app.ed));
}

/**
 * Mark the current doc as durably persisted: move the autosave baseline to `md`
 * and drop the stored draft. Called on load, on Reload, and after a successful
 * Save-draft / Commit — anything meaning "disk now matches (or supersedes) the
 * editor", so there is no longer an unsaved edit to protect.
 */
function markPersisted(app: App, md: string): void {
  if (!app.draft) return;
  app.draft.base = md;
  clearDraft(window.localStorage, app.draft.name);
}

/** Trailing debounce: coalesce a burst of keystrokes into one autosave. */
function debounce(fn: () => void, ms: number): () => void {
  let timer: number | undefined;
  return () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(fn, ms);
  };
}

/**
 * Reveal the "unsaved draft restored" bar and wire its Discard button, which
 * reverts the editor to the server doc and drops the stored draft. Keeping the
 * draft is the default (do nothing — it stays live and re-autosaves).
 */
function wireDraftBanner(app: App): void {
  document.getElementById('draft-banner')?.toggleAttribute('hidden', false);
  document.getElementById('draft-discard')?.addEventListener('click', () => {
    if (app.draft) {
      loadMarkdown(app.ed, app.draft.base);
      clearDraft(window.localStorage, app.draft.name);
    }
    document.getElementById('draft-banner')?.toggleAttribute('hidden', true);
    void rerender(app);
  });
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

  const { name, current, baseline, baselineIso, isSample } = await loadState();
  const { threads, usingStore } = await loadThreads();
  const skillCommands = await fetchSkills();
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
    composeThreadId: null,
    composeEditor: null,
    draftSeq: new Map(),
    skillCommands,
    draft: !isSample && name ? { name, base: current } : null,
  };

  // Unsaved-edit safety net (draft-store.ts): the editor is otherwise
  // memory-only, so a full reload — Vite restarting the dev server after a
  // laptop sleep, an accidental refresh, a tab crash — would silently discard
  // in-memory edits. Restore any draft a prior session left (offering Discard),
  // then autosave on edits and, decisively, right before any unload.
  if (app.draft) {
    const restored = loadDraft(window.localStorage, app.draft.name, current);
    if (restored !== null) {
      loadMarkdown(app.ed, restored);
      wireDraftBanner(app);
    }
    const scheduleSave = debounce(() => autosaveDraft(app), 800);
    ed.view.dom.addEventListener('input', scheduleSave);
    ed.view.dom.addEventListener('keyup', scheduleSave);
    // mouseup catches a highlight→comment anchor addition (which changes the doc
    // with no keystroke); beforeunload below is the ultimate backstop.
    ed.view.dom.addEventListener('mouseup', scheduleSave);
    // beforeunload fires even on Vite's programmatic location.reload(), so it
    // captures the exact pre-reload state; the debounced saves are the backup
    // for a hard crash where beforeunload never runs.
    window.addEventListener('beforeunload', () => autosaveDraft(app));
  }

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
        // Pulled a fresh committed doc: it's the new autosave baseline, and any
        // draft against the OLD base is now stale — drop it.
        markPersisted(app, next.current);
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
 * Auto-anchor a new thread on the current selection and activate its compose
 * box (replaces an explicit "Add comment" button). Guards against
 * re-anchoring text that's already commented, and against firing repeatedly
 * for the same settled selection (mouseup fires once per drag, but keyup can
 * re-fire while extending a selection with the keyboard —
 * {@link selectionOverlapsAnchor} short-circuits once this exact span is
 * already wrapped by the anchor we just applied).
 *
 * No "previous compose thread" cleanup is needed here, unlike the old
 * pendingThreadId design: starting a new highlight in the main document
 * necessarily blurs whatever compose box was focused first (ordinary browser
 * focus semantics), and blur is exactly what {@link deactivateCompose}
 * listens for — by the time this runs, any prior compose thread has already
 * settled (abandoned if empty, saved otherwise).
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

  app.composeThreadId = id;
  app.expanded.add(id); // a thread you just opened starts expanded
  void rerender(app);
}

/**
 * Deactivate the current compose thread (if any): read its live content,
 * decide what that means, and settle it before clearing `composeThreadId`.
 *   - empty + no draft yet + no other (older) comments → abandon: drop the
 *     anchor entirely (today's "abandon empty" rule, re-keyed off `draftSeq`
 *     instead of the old `pendingThreadId`).
 *   - empty otherwise → just deactivate, nothing to save.
 *   - non-empty → upsert (amend the tracked draft seq if one exists, else
 *     create a new comment and start tracking its seq).
 * Called on blur, and proactively before Commit/Save-draft (which then also
 * clears `draftSeq` — see {@link sealDrafts}). `composeThreadId` is cleared
 * up front so a second call (e.g. Commit right after a natural blur) is a
 * fast no-op rather than double-handling the same thread; the accepted
 * tradeoff is that such a second call doesn't *wait* for an already-in-flight
 * upsert from the first — low stakes, since `draftSeq` is a browser-session
 * bookkeeping map, not the source of truth (the store write itself isn't
 * affected either way).
 */
async function deactivateCompose(app: App): Promise<void> {
  const id = app.composeThreadId;
  if (!id) return;
  const ed = app.composeEditor;
  app.composeThreadId = null;
  if (!ed) return;

  const hasDraft = app.draftSeq.has(id);
  const hasHistory = (app.threads.find((t) => t.id === id)?.comments.length ?? 0) > 0;

  if (isDocEmpty(ed)) {
    if (!hasDraft && !hasHistory) {
      app.expanded.delete(id);
      removeAnchor(app.ed, id);
    }
  } else {
    const body = await resolveComposeBody(app, ed);
    const seq = await upsertDraft(app, id, body, hasDraft ? (app.draftSeq.get(id) ?? null) : null);
    app.draftSeq.set(id, seq);
  }
  await rerender(app);
}

/**
 * Matches a slash command still recognisable in a *finished* compose box:
 * `/name` at the very start, at least one whitespace char, then the rest as
 * context — e.g. `/example hello world` or `/example\nhello world`.
 */
const SLASH_COMMAND_RE = /^\/(\S+)\s+([\s\S]*)$/;

/**
 * If the compose box's content is a recognised slash command
 * (`/<skill-name> <context>`), resolve it live (see skills-client.ts
 * `runSkill`) and return the skill's result — that becomes the saved
 * comment, not the literal `/command …` text. Anything else (including a
 * `/word` that doesn't match a known skill) passes through unchanged, so an
 * ordinary comment that happens to start with a slash is never mistaken for
 * a command. On a failed run, keeps the human's original text (appending the
 * error) rather than losing it.
 *
 * No loading indicator is shown while this is in flight — the compose box is
 * already gone by the time this runs (deactivation happens on blur, before
 * the result is known), so a slash-command reply can take a few seconds to
 * appear with no visible progress. Worth revisiting if it proves confusing
 * in practice; out of scope for proving the invocation mechanism itself.
 */
async function resolveComposeBody(app: App, ed: DocloopEditor): Promise<string> {
  const body = currentMarkdown(ed);
  const match = SLASH_COMMAND_RE.exec(body);
  if (!match) return body;
  const [, name, context] = match;
  if (!app.skillCommands.some((c) => c.name === name)) return body;
  try {
    return await runSkill(name, context.trim());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `${body}\n\n_(⚠ /${name} failed: ${message})_`;
  }
}

/**
 * Settle whatever's currently being composed, then seal every draft this
 * session — whatever was mid-flight is now committed history; the next edit
 * to any of those threads starts a fresh comment rather than continuing to
 * amend now-sealed ones. Called before the doc is serialised for hand-off
 * (Commit / Save-draft).
 */
async function sealDrafts(app: App): Promise<void> {
  await deactivateCompose(app); // settles whatever's currently focused (and rerenders, if so)
  app.draftSeq.clear();
  // Unconditional rerender: deactivateCompose already re-rendered if it had
  // something to settle, but clearing draftSeq needs to be reflected in the
  // sidebar too (placeholders flip from "Continue editing…" back to
  // "Reply…") even when nothing was actively focused at the time.
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
      await sealDrafts(app);
      const res = await fetch('/commit', { method: 'POST', body: currentMarkdown(app.ed) });
      const json = (await res.json()) as { ok: boolean; committed?: boolean; commit?: string };
      btn.textContent = !json.ok
        ? 'Commit failed'
        : json.committed
          ? `Committed ${json.commit}`
          : 'No changes';
      // The doc we just sent is now on disk — clear the unsaved-edit safety net.
      if (json.ok) markPersisted(app, currentMarkdown(app.ed));
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
      await sealDrafts(app);
      const res = await fetch('/save-draft', { method: 'POST', body: currentMarkdown(app.ed) });
      const json = (await res.json()) as { ok: boolean };
      btn.textContent = json.ok ? 'Saved' : 'Save failed';
      // Draft is on disk now — clear the localStorage safety net for it.
      if (json.ok) markPersisted(app, currentMarkdown(app.ed));
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

/**
 * Create or amend a thread's draft comment (the compose box's blur-driven
 * upsert), via the store or (offline) in-memory. `existingSeq` amends that
 * seq in place; `null` creates a new comment. Returns the resulting seq, for
 * the caller to start (or keep) tracking in `app.draftSeq`.
 */
async function upsertDraft(
  app: App,
  id: string,
  body: string,
  existingSeq: number | null,
): Promise<number> {
  if (app.usingStore) {
    if (existingSeq != null) {
      await updateComment(id, existingSeq, body);
      app.threads = await fetchThreads();
      return existingSeq;
    }
    const comment = await replyThread(id, body);
    app.threads = await fetchThreads();
    return comment.seq;
  }
  // Offline demo: mutate the cached store so the sidebar still updates.
  let thread = app.threads.find((t) => t.id === id);
  if (!thread) {
    thread = { id, comments: [] };
    app.threads.push(thread);
  }
  if (existingSeq != null) {
    const existing = thread.comments.find((c) => c.seq === existingSeq);
    if (existing) existing.body = body;
    return existingSeq;
  }
  const seq = thread.comments.length ? thread.comments[thread.comments.length - 1].seq + 1 : 1;
  thread.comments.push({ seq, author: 'rjs', created: new Date().toISOString(), body });
  return seq;
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
 * (`app.commentEditors`, `app.composeEditor`, `app.els.threads`'s DOM) — two
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

  // 2. Rebuild the gutter: tear down old comment + compose editors, then
  // thread cards + change cards (the still-pending changes). The compose
  // editor is always torn down here too (never preserved across a rerender)
  // — safe because any action that could trigger a rerender necessarily blurs
  // it first (ordinary focus semantics), which has already settled it via
  // deactivateCompose by the time this runs; renderThreads recreates it fresh
  // if `composeThreadId` is (still, or newly) set.
  await Promise.all(app.commentEditors.map((e) => e.destroy()));
  app.commentEditors = [];
  if (app.composeEditor) {
    await app.composeEditor.destroy();
    app.composeEditor = null;
  }
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
 * recent comment (the one you'd be replying to), activate its compose box,
 * and scroll the card into view.
 */
async function focusThread(app: App, id: string): Promise<void> {
  app.expanded.add(id);
  const comments = app.threads.find((t) => t.id === id)?.comments ?? [];
  if (comments.length) app.expandedComments.add(`${id}#${comments[comments.length - 1].seq}`);
  app.composeThreadId = id;
  await rerender(app);
  app.els.threads
    .querySelector(`.thread[data-thread="${id}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Render one comment body as a read-only Milkdown instance inside `host`.
 *
 * Isolated in its own try/catch: `createEditor` parses arbitrary markdown a
 * human (or LLM) typed, so it can throw on content docloop's schema doesn't
 * expect (e.g. an unhandled remark-directive edge case — see
 * src/directive-gate.ts for the one this was written for). One bad comment
 * failing to render must not blank the rest of the sidebar — renderThreads
 * awaits this per comment in a loop with no isolation of its own, so a bare
 * throw here would abort every anchor after it too.
 */
async function renderComment(app: App, host: HTMLElement, body: string): Promise<void> {
  const mount = document.createElement('div');
  mount.className = 'comment-body';
  host.appendChild(mount);
  try {
    const ed = await createEditor(mount, body, { editable: false });
    app.commentEditors.push(ed);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('comment failed to render', err);
    mount.classList.add('comment-render-error');
    mount.textContent = 'This comment could not be displayed.';
  }
}

/**
 * Render the threads sidebar: each document anchor, its store comments
 * (read-only Milkdown), a compose slot (the live editor if this thread is
 * active, else a placeholder), and a Resolve button.
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
      if (app.composeThreadId === a.id) app.composeThreadId = null;
      app.draftSeq.delete(a.id);
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

    // Compose slot: at most one live editable Milkdown instance exists
    // app-wide at a time (whichever thread is being composed — see
    // deactivateCompose). Every other thread's slot is a cheap placeholder
    // that activates the live editor on click.
    const composeHost = document.createElement('div');
    composeHost.className = 'compose-host';
    li.appendChild(composeHost);

    // Attach to the live DOM BEFORE mounting/focusing the compose editor —
    // a detached element can't receive focus.
    host.appendChild(li);

    if (app.composeThreadId === a.id) {
      await mountCompose(app, composeHost, a.id, comments);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'reply-placeholder muted';
      placeholder.title = 'Click to reply';
      placeholder.textContent = app.draftSeq.has(a.id) ? 'Continue editing…' : 'Reply…';
      placeholder.addEventListener('click', () => {
        app.composeThreadId = a.id;
        void rerender(app);
      });
      composeHost.appendChild(placeholder);
    }
  }
}

/**
 * Mount the one live editable compose instance for thread `id` into `host`,
 * seeded with its current draft body if one exists (see `app.draftSeq`).
 * Guards the async creation gap: if `composeThreadId` moved on to a
 * different thread while this was awaiting (its own blur, or another
 * thread's placeholder was clicked), the just-created instance is discarded
 * rather than mounted.
 */
async function mountCompose(
  app: App,
  host: HTMLElement,
  id: string,
  comments: StoreComment[],
): Promise<void> {
  const draftSeq = app.draftSeq.get(id);
  const seed = draftSeq != null ? (comments.find((c) => c.seq === draftSeq)?.body ?? '') : '';
  const ed = await createEditor(host, seed, {
    editable: true,
    plugins: [slashMenuPlugin(() => app.skillCommands)],
  });
  if (app.composeThreadId !== id) {
    await ed.destroy();
    return;
  }
  app.composeEditor = ed;
  ed.view.dom.addEventListener('blur', () => {
    void deactivateCompose(app);
  });
  ed.view.dom.addEventListener('input', () => {
    scheduleLayout(app); // height changed as the user types → restack the gutter
  });
  ed.view.focus();
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
