/**
 * Left-nav renderers: the doc list (switch which doc the editor reviews) and
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

/**
 * Render the doc list into `host`: one `<li class="doc-item">` per doc, the
 * active doc marked `.active` (and inert — clicking it is a no-op), non-clean
 * states carried as `data-state` plus a `.doc-dot` marker with a tooltip.
 * Clicking a non-active item calls `onSelect(name)`.
 */
export function renderDocList(
  host: HTMLElement,
  docs: DocInfo[],
  activeName: string | null,
  onSelect: (name: string) => void,
): void {
  host.replaceChildren(
    ...docs.map((doc) => {
      const li = document.createElement('li');
      li.className = 'doc-item';
      li.setAttribute('data-state', doc.state);

      const name = document.createElement('span');
      name.className = 'doc-name';
      name.textContent = doc.name;
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
    }),
  );
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
