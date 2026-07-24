/**
 * Left-nav renderers: the doc tree (switch which doc the editor reviews) and
 * the node tree (the read-only ctx node-store seam). Pure DOM builders — no
 * fetches, no app state; main.ts owns wiring them to /docs, /nodes and
 * switchDoc. Each render replaces the host's children wholesale (the lists
 * are tiny; diffing would be complexity for nothing).
 */
import type { DocInfo } from './docs-client';
import type { NodeEntry } from './nodes-fs';

/** Human-readable tooltip per non-clean doc state (the `.doc-dot` marker). */
const STATE_TITLES: Record<string, string> = {
  draft: 'Uncommitted draft — working tree differs from the last commit',
  untracked: 'Untracked — saved to the working tree but never committed',
};

/** One directory level of the doc tree: docs directly here + subdirectories. */
interface DocDir {
  docs: DocInfo[];
  dirs: Map<string, DocDir>;
}

/** Group path-qualified doc ids (`nodes/16/design.md`) into a directory tree. */
function buildDocTree(docs: DocInfo[]): DocDir {
  const root: DocDir = { docs: [], dirs: new Map() };
  for (const doc of docs) {
    const segments = doc.name.split('/');
    let dir = root;
    for (const seg of segments.slice(0, -1)) {
      let next = dir.dirs.get(seg);
      if (!next) {
        next = { docs: [], dirs: new Map() };
        dir.dirs.set(seg, next);
      }
      dir = next;
    }
    dir.docs.push(doc);
  }
  return root;
}

/**
 * The open/closed state of every `<details data-dir>` currently in `host`,
 * so a re-render (doc states flip on Commit / Save-draft / Reload) preserves
 * the human's expand/collapse choices instead of resetting them.
 */
function collectDirState(host: HTMLElement): Map<string, boolean> {
  const state = new Map<string, boolean>();
  for (const d of host.querySelectorAll<HTMLDetailsElement>('details[data-dir]')) {
    const dir = d.getAttribute('data-dir');
    if (dir) state.set(dir, d.open);
  }
  return state;
}

/**
 * Render the doc tree into `host`: one `<li class="doc-item">` per doc (its
 * visible label the basename, its id the full workspace-relative path), the
 * active doc marked `.active` (and inert — clicking it is a no-op),
 * non-clean states carried as `data-state` plus a `.doc-dot` marker with a
 * tooltip. Directories render as collapsible `<details class="doc-dir">`
 * levels — a flat workspace has none and looks exactly like the old flat
 * list. A directory not seen before starts open iff it is on the active
 * doc's path; after that the human's expand/collapse choice sticks across
 * re-renders. Clicking a non-active doc calls `onSelect(name)` with the
 * full path.
 */
export function renderDocList(
  host: HTMLElement,
  docs: DocInfo[],
  activeName: string | null,
  onSelect: (name: string) => void,
): void {
  const dirState = collectDirState(host);
  host.replaceChildren(...renderDirChildren(buildDocTree(docs), '', activeName, onSelect, dirState));
}

/** The `<li>` children of one directory level: its docs first, then its subdirectories. */
function renderDirChildren(
  dir: DocDir,
  prefix: string,
  activeName: string | null,
  onSelect: (name: string) => void,
  dirState: Map<string, boolean>,
): HTMLElement[] {
  const items = dir.docs.map((doc) => renderDocItem(doc, activeName, onSelect));
  for (const [seg, sub] of [...dir.dirs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const path = prefix ? `${prefix}/${seg}` : seg;

    const li = document.createElement('li');
    li.className = 'doc-dir';
    const details = document.createElement('details');
    details.setAttribute('data-dir', path);
    details.open = dirState.get(path) ?? (activeName !== null && activeName.startsWith(`${path}/`));
    const summary = document.createElement('summary');
    summary.className = 'doc-dir-name';
    summary.textContent = seg;
    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.className = 'doc-list';
    ul.replaceChildren(...renderDirChildren(sub, path, activeName, onSelect, dirState));
    details.appendChild(ul);
    li.appendChild(details);
    items.push(li);
  }
  return items;
}

/** One doc leaf (label = basename; full path in the tooltip when nested). */
function renderDocItem(
  doc: DocInfo,
  activeName: string | null,
  onSelect: (name: string) => void,
): HTMLElement {
  const li = document.createElement('li');
  li.className = 'doc-item';
  li.setAttribute('data-state', doc.state);

  const name = document.createElement('span');
  name.className = 'doc-name';
  name.textContent = doc.name.split('/').pop() ?? doc.name;
  if (doc.name.includes('/')) name.title = doc.name;
  li.appendChild(name);

  if (doc.state !== 'clean') {
    const dot = document.createElement('span');
    dot.className = 'doc-dot';
    dot.title = STATE_TITLES[doc.state] ?? doc.state;
    li.appendChild(dot);
  }

  if (doc.name === activeName) {
    li.classList.add('active');
  } else {
    li.addEventListener('click', () => onSelect(doc.name));
  }
  return li;
}

/**
 * Render the node tree into `host`: a nested `<details class="node">` per
 * NodeEntry (native expand/collapse — no JS state to keep), its summary the
 * title plus a state badge when the state is known, its `*.md` docs as muted
 * non-interactive leaves. Top-level nodes start open, deeper levels closed.
 */
export function renderNodeTree(host: HTMLElement, nodes: NodeEntry[]): void {
  host.replaceChildren(...nodes.map((n) => renderNode(n, true)));
}

/** One node as a `<details>`: summary (title + optional badge), doc leaves, children. */
function renderNode(node: NodeEntry, topLevel: boolean): HTMLElement {
  const details = document.createElement('details');
  details.className = 'node';
  details.open = topLevel;

  const summary = document.createElement('summary');
  const title = document.createElement('span');
  title.className = 'node-title';
  title.textContent = node.title;
  summary.appendChild(title);
  if (node.state !== 'unknown') {
    const badge = document.createElement('span');
    badge.className = 'node-state';
    badge.textContent = node.state;
    summary.appendChild(badge);
  }
  details.appendChild(summary);

  if (node.docs.length > 0) {
    const docList = document.createElement('ul');
    docList.className = 'node-docs';
    for (const doc of node.docs) {
      const leaf = document.createElement('li');
      leaf.className = 'node-doc muted';
      leaf.textContent = doc;
      docList.appendChild(leaf);
    }
    details.appendChild(docList);
  }

  for (const child of node.children) details.appendChild(renderNode(child, false));
  return details;
}
