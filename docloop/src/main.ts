/**
 * docloop write view (M2) entry point.
 *
 * M1 was read-only; M2 makes the same view writeable while keeping the editor's
 * doc as the single source of truth (see src/write-actions.ts). It wires:
 *
 *   - the diff vs a mutable BASELINE (starts as OLD_MD) painted as ProseMirror
 *     decorations (green inserts, red delete widgets) + the <mark> anchor
 *     highlights — re-derived after every action,
 *   - a threads sidebar with a reply box per thread and a Resolve control,
 *   - an "Add comment" button that anchors a comment on the current selection,
 *   - a "Changes" panel listing each diff hunk with Accept / Reject controls.
 *
 * Every mutation goes through the M0 serialise→transform→reload path, so the doc
 * the editor holds and the markdown that would be saved never disagree.
 */
import { DecorationSet } from '@milkdown/prose/view';
import { createEditor, type DocloopEditor } from './editor';
import { buildReadViewDecorations } from './decorations';
import { decorationPlugin, decoPluginKey } from './deco-plugin';
import { extractThreads, type Thread } from './threads';
import {
  addComment,
  reply as replyAction,
  resolve as resolveAction,
  currentMarkdown,
  loadMarkdown,
  hasTextSelection,
} from './write-actions';
import { listHunks, acceptHunk, rejectHunk, type Hunk } from './hunks';
import { OLD_MD, NEW_MD } from './sample';

/** Mutable app state: the editor + the diff baseline (advances as hunks accept). */
interface App {
  ed: DocloopEditor;
  baselineMd: string;
  els: {
    threads: HTMLElement;
    changes: HTMLElement;
    addBtn: HTMLButtonElement;
  };
  /** thread id whose reply box should grab focus after the next render */
  focusReplyFor: string | null;
}

async function main(): Promise<void> {
  const editorRoot = document.getElementById('editor');
  const threadList = document.getElementById('threads');
  const changes = document.getElementById('changes');
  const addBtn = document.getElementById('add-comment') as HTMLButtonElement | null;
  if (!editorRoot || !threadList || !changes || !addBtn) {
    throw new Error('missing #editor / #threads / #changes / #add-comment');
  }

  // Editable editor with NEW_MD. The decoration plugin starts empty; filled
  // after the doc (and its positions) exists.
  const ed = await createEditor(editorRoot, NEW_MD, {
    editable: true,
    plugins: [decorationPlugin(DecorationSet.empty)],
  });

  const app: App = {
    ed,
    baselineMd: OLD_MD,
    els: { threads: threadList, changes, addBtn },
    focusReplyFor: null,
  };

  // "Add comment" is enabled only when there's a span to anchor on. Keep it in
  // sync with the selection.
  const syncAddBtn = () => {
    addBtn.disabled = !hasTextSelection(ed);
  };
  ed.view.dom.addEventListener('mouseup', syncAddBtn);
  ed.view.dom.addEventListener('keyup', syncAddBtn);
  syncAddBtn();

  addBtn.addEventListener('click', () => {
    const id = addComment(app.ed);
    if (id) {
      app.focusReplyFor = id; // focus its reply box once the sidebar re-renders
      rerender(app);
    }
  });

  rerender(app);
}

/** Re-derive decorations + sidebar + changes panel from the current state. */
function rerender(app: App): void {
  const { ed } = app;

  // 1. Decorations: diff live doc vs the (mutable) baseline + mark highlights.
  const baselineDoc = ed.parse(app.baselineMd);
  const liveDoc = ed.view.state.doc;
  const set = buildReadViewDecorations(baselineDoc, liveDoc);
  ed.view.dispatch(ed.view.state.tr.setMeta(decoPluginKey, set));

  // 2. Sidebar threads + 3. changes, both derived from the current markdown.
  const md = currentMarkdown(ed);
  renderThreads(app, extractThreads(md));
  renderChanges(app, listHunks(app.baselineMd, md));
}

/** Render the threads sidebar: each thread gets a reply box + Resolve button. */
function renderThreads(app: App, threads: Thread[]): void {
  const host = app.els.threads;
  host.replaceChildren();

  if (threads.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = 'No comment threads.';
    host.appendChild(empty);
    return;
  }

  threads.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = 'thread';
    li.dataset.thread = t.id;

    const head = document.createElement('div');
    head.className = 'thread-head';

    const badge = document.createElement('span');
    badge.className = 'thread-badge';
    badge.textContent = String(i + 1);
    head.appendChild(badge);

    const anchor = document.createElement('span');
    anchor.className = 'thread-anchor';
    anchor.textContent = t.anchor ? `“${t.anchor}”` : '(no anchor)';
    head.appendChild(anchor);

    const resolveBtn = document.createElement('button');
    resolveBtn.className = 'btn btn-resolve';
    resolveBtn.textContent = 'Resolve';
    resolveBtn.title = 'Unwrap the anchor and delete this thread';
    resolveBtn.addEventListener('click', () => {
      resolveAction(app.ed, t.id);
      rerender(app);
    });
    head.appendChild(resolveBtn);
    li.appendChild(head);

    const body = document.createElement('div');
    if (t.body === null || t.body === '') {
      body.className = 'thread-body muted';
      body.textContent = t.body === '' ? '(no replies yet)' : '(orphan anchor — no thread body)';
    } else {
      body.className = 'thread-body';
      // Replies are <br>-joined in storage; show them as separate lines.
      t.body.split('<br>').forEach((line, j) => {
        if (j > 0) body.appendChild(document.createElement('br'));
        body.appendChild(document.createTextNode(line));
      });
    }
    li.appendChild(body);

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
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      replyAction(app.ed, t.id, text);
      rerender(app);
    });
    li.appendChild(form);

    host.appendChild(li);

    if (app.focusReplyFor === t.id) input.focus();
  });

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
      rerender(app);
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
      rerender(app);
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
