/**
 * Client-side unsaved-edit safety net for the Milkdown editor.
 *
 * The editor is otherwise **memory-only**: a full page reload — Vite restarting
 * the dev server after a laptop sleep, an accidental refresh, a tab crash —
 * rebuilds the editor from the server's committed doc (`GET /doc`) and silently
 * discards any in-memory edits. This module stashes the live markdown in a
 * `Storage` (browser `localStorage` in practice) so those edits can be restored
 * after such a reload, instead of lost.
 *
 * Storage is **injected** (a minimal Storage-like interface) so the logic is a
 * pure, unit-testable core with no `window`/`localStorage` global — matching the
 * repo's "deterministic tested core" style (see turn.ts, threads-store.ts).
 *
 * Note on the sidecar comment store: comment *bodies* are already durable —
 * `POST /threads` writes them server-side immediately — but a comment's *anchor*
 * lives in the (memory-only) doc, so a reload that reverts the doc would orphan
 * the anchor from its already-persisted body. Restoring the doc from here keeps
 * anchors consistent with those bodies, so this protects the threads too.
 */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** What we persist: the edited markdown + a fingerprint of the doc it edits. */
interface StoredDraft {
  /** fingerprint of the server doc the draft was edited on top of */
  base: string;
  /** the edited markdown to restore */
  draft: string;
  /** when it was stored (UTC ISO) — for the restore notice / debugging */
  savedAt: string;
}

const PREFIX = 'docloop:draft:';
const keyFor = (docName: string): string => `${PREFIX}${docName}`;

/**
 * A cheap, stable fingerprint of a doc: its length + a 32-bit rolling hash.
 * Enough to detect "the base doc moved" (Claude committed a new turn) without
 * storing the whole base alongside every draft. Not cryptographic — collisions
 * are astronomically unlikely for this use and harmless anyway (worst case: a
 * genuinely-stale draft is offered for restore, which the human can Discard).
 */
export function fingerprint(md: string): string {
  let h = 0;
  for (let i = 0; i < md.length; i++) {
    h = (Math.imul(31, h) + md.charCodeAt(i)) | 0;
  }
  return `${md.length}:${(h >>> 0).toString(36)}`;
}

/**
 * Persist the current edit for `docName`, keyed by doc so two docs (one server
 * per doc, but they share the browser's localStorage) never collide. No-ops —
 * and actively clears any prior draft — when the edit is identical to `baseMd`:
 * there is nothing unsaved to protect, and a leftover record would falsely
 * trigger a restore on the next load.
 */
export function saveDraft(
  storage: DraftStorage,
  docName: string,
  baseMd: string,
  draftMd: string,
  now: () => string = () => new Date().toISOString(),
): void {
  if (draftMd === baseMd) {
    storage.removeItem(keyFor(docName));
    return;
  }
  const rec: StoredDraft = { base: fingerprint(baseMd), draft: draftMd, savedAt: now() };
  storage.setItem(keyFor(docName), JSON.stringify(rec));
}

/**
 * The draft to restore for `docName`, or `null` when there is nothing worth
 * restoring. Returns `null` when: no draft is stored; the stored value is
 * malformed; the base has **moved** (a different server `current` — e.g. Claude
 * committed a new turn — so restoring would clobber it); or the draft already
 * **equals** the current server doc (nothing actually differs). A returned
 * string is always a real, on-top-of-current unsaved edit worth offering back.
 */
export function loadDraft(
  storage: DraftStorage,
  docName: string,
  serverCurrentMd: string,
): string | null {
  const raw = storage.getItem(keyFor(docName));
  if (!raw) return null;
  let rec: StoredDraft;
  try {
    rec = JSON.parse(raw) as StoredDraft;
  } catch {
    return null;
  }
  if (!rec || typeof rec.draft !== 'string' || typeof rec.base !== 'string') return null;
  if (rec.base !== fingerprint(serverCurrentMd)) return null; // base moved → stale
  if (rec.draft === serverCurrentMd) return null; // nothing differs
  return rec.draft;
}

/** Drop the stored draft — call after a successful Save-draft / Commit. */
export function clearDraft(storage: DraftStorage, docName: string): void {
  storage.removeItem(keyFor(docName));
}
