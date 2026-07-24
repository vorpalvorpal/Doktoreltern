/**
 * Package E: the left-nav renderers (src/nav.ts) — pure DOM builders for the
 * doc list and the node tree, tested under the suite's jsdom environment.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderDocList, renderNodeTree } from '../src/nav';
import type { DocInfo } from '../src/docs-client';
import type { NodeEntry } from '../src/nodes-fs';

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement('ul');
  document.body.replaceChildren(host);
});

const docs: DocInfo[] = [
  { name: 'design.md', state: 'draft' },
  { name: 'doc.md', state: 'clean' },
  { name: 'notes.md', state: 'untracked' },
];

describe('renderDocList', () => {
  it('renders one item per doc, carrying name and data-state', () => {
    renderDocList(host, docs, 'doc.md', () => {});
    const items = Array.from(host.querySelectorAll('.doc-item'));
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('design.md'),
        expect.stringContaining('doc.md'),
        expect.stringContaining('notes.md'),
      ]),
    );
    expect(items.map((i) => i.getAttribute('data-state'))).toEqual([
      'draft',
      'clean',
      'untracked',
    ]);
  });

  it('marks exactly the active doc', () => {
    renderDocList(host, docs, 'design.md', () => {});
    const active = Array.from(host.querySelectorAll('.doc-item.active'));
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toContain('design.md');
  });

  it('shows a dot only for non-clean docs', () => {
    renderDocList(host, docs, 'doc.md', () => {});
    const withDot = Array.from(host.querySelectorAll('.doc-item')).filter((i) =>
      i.querySelector('.doc-dot'),
    );
    expect(withDot.map((i) => i.getAttribute('data-state')).sort()).toEqual([
      'draft',
      'untracked',
    ]);
  });

  it('clicking a non-active item calls onSelect with its name', () => {
    const onSelect = vi.fn();
    renderDocList(host, docs, 'doc.md', onSelect);
    const design = Array.from(host.querySelectorAll<HTMLElement>('.doc-item')).find((i) =>
      i.textContent?.includes('design.md'),
    );
    design?.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('design.md');
  });

  it('clicking the active item is a no-op', () => {
    const onSelect = vi.fn();
    renderDocList(host, docs, 'doc.md', onSelect);
    const active = host.querySelector<HTMLElement>('.doc-item.active');
    active?.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('re-render replaces the previous list rather than appending', () => {
    renderDocList(host, docs, 'doc.md', () => {});
    renderDocList(host, docs, 'design.md', () => {});
    expect(host.querySelectorAll('.doc-item')).toHaveLength(3);
    expect(host.querySelectorAll('.doc-item.active')).toHaveLength(1);
  });

  it('a flat workspace renders exactly the old flat list — no details elements', () => {
    renderDocList(host, docs, 'doc.md', () => {});
    expect(host.querySelectorAll('details')).toHaveLength(0);
    expect(host.querySelectorAll('.doc-dir')).toHaveLength(0);
    expect(host.querySelectorAll(':scope > .doc-item')).toHaveLength(3);
  });
});

const nestedDocs: DocInfo[] = [
  { name: 'doc.md', state: 'clean' },
  { name: 'nodes/16/design.md', state: 'draft' },
  { name: 'nodes/16/plan.md', state: 'clean' },
  { name: 'nodes/17/notes.md', state: 'untracked' },
];

describe('renderDocList — path-qualified ids (doc tree)', () => {
  it('groups nested ids into a <details class="doc-dir"> tree keyed by data-dir', () => {
    renderDocList(host, nestedDocs, 'doc.md', () => {});
    const dirs = Array.from(host.querySelectorAll<HTMLDetailsElement>('details[data-dir]'));
    expect(dirs.map((d) => d.getAttribute('data-dir')).sort()).toEqual([
      'nodes',
      'nodes/16',
      'nodes/17',
    ]);
    // Every details level is a .doc-dir li with a .doc-dir-name summary.
    for (const d of dirs) {
      expect(d.closest('li')?.classList.contains('doc-dir')).toBe(true);
      expect(d.querySelector(':scope > summary')?.classList.contains('doc-dir-name')).toBe(true);
    }
    // nodes/16 nests inside nodes; its docs nest inside it.
    const nodes16 = host.querySelector('details[data-dir="nodes/16"]');
    expect(nodes16?.closest('details[data-dir="nodes"]')).not.toBeNull();
    const leaves = Array.from(nodes16?.querySelectorAll('.doc-item') ?? []);
    expect(leaves.map((l) => l.querySelector('.doc-name')?.textContent)).toEqual([
      'design.md',
      'plan.md',
    ]);
  });

  it('labels are basenames with the full path in title; flat docs get no title', () => {
    renderDocList(host, nestedDocs, 'doc.md', () => {});
    const names = Array.from(host.querySelectorAll<HTMLElement>('.doc-name'));
    const byText = (t: string) => names.filter((n) => n.textContent === t);
    expect(byText('design.md')[0].title).toBe('nodes/16/design.md');
    expect(byText('notes.md')[0].title).toBe('nodes/17/notes.md');
    expect(byText('doc.md')[0].title).toBe('');
  });

  it('a never-seen dir starts open iff it is on the active doc’s path', () => {
    renderDocList(host, nestedDocs, 'nodes/16/design.md', () => {});
    const open = (dir: string) =>
      host.querySelector<HTMLDetailsElement>(`details[data-dir="${dir}"]`)!.open;
    expect(open('nodes')).toBe(true);
    expect(open('nodes/16')).toBe(true);
    expect(open('nodes/17')).toBe(false);
  });

  it('expand/collapse choices survive a re-render (collectDirState)', () => {
    renderDocList(host, nestedDocs, 'nodes/16/design.md', () => {});
    // The human closes nodes/16 and opens nodes/17…
    host.querySelector<HTMLDetailsElement>('details[data-dir="nodes/16"]')!.open = false;
    host.querySelector<HTMLDetailsElement>('details[data-dir="nodes/17"]')!.open = true;

    // …and a state-flip re-render (same active doc) keeps both choices, even
    // though the default for nodes/16 would be open (active doc inside it).
    renderDocList(host, nestedDocs, 'nodes/16/design.md', () => {});
    const open = (dir: string) =>
      host.querySelector<HTMLDetailsElement>(`details[data-dir="${dir}"]`)!.open;
    expect(open('nodes/16')).toBe(false);
    expect(open('nodes/17')).toBe(true);
    expect(open('nodes')).toBe(true);
  });

  it('clicking a nested doc calls onSelect with the FULL path', () => {
    const onSelect = vi.fn();
    renderDocList(host, nestedDocs, 'doc.md', onSelect);
    const design = Array.from(host.querySelectorAll<HTMLElement>('.doc-item')).find(
      (i) => i.querySelector('.doc-name')?.textContent === 'design.md',
    );
    design?.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('nodes/16/design.md');
  });

  it('the active nested doc is marked active and inert', () => {
    const onSelect = vi.fn();
    renderDocList(host, nestedDocs, 'nodes/16/design.md', onSelect);
    const active = host.querySelector<HTMLElement>('.doc-item.active');
    expect(active?.querySelector('.doc-name')?.textContent).toBe('design.md');
    active?.click();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

const nodes: NodeEntry[] = [
  {
    id: 'substrate',
    title: 'substrate',
    state: 'unknown',
    docs: ['design.md', 'plan.md'],
    children: [
      {
        id: 'substrate/store',
        title: 'store',
        state: 'open',
        docs: [],
        children: [],
      },
    ],
  },
];

describe('renderNodeTree', () => {
  it('renders a details element per node, nested to match the input', () => {
    renderNodeTree(host, nodes);
    const top = host.querySelector('details.node');
    expect(top).not.toBeNull();
    expect(top?.querySelector('summary')?.textContent).toContain('substrate');
    const child = top?.querySelector('details.node');
    expect(child?.querySelector('summary')?.textContent).toContain('store');
  });

  it('renders node docs as non-interactive leaves', () => {
    renderNodeTree(host, nodes);
    const leaves = Array.from(host.querySelectorAll('.node-doc'));
    expect(leaves.map((l) => l.textContent)).toEqual([
      expect.stringContaining('design.md'),
      expect.stringContaining('plan.md'),
    ]);
    expect(host.querySelector('.node-doc a, .node-doc button')).toBeNull();
  });

  it("shows a state badge only when state isn't 'unknown'", () => {
    renderNodeTree(host, nodes);
    const badges = Array.from(host.querySelectorAll('.node-state'));
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toContain('open');
  });

  it('top-level nodes start open; nested ones start closed', () => {
    renderNodeTree(host, nodes);
    const top = host.querySelector<HTMLDetailsElement>('details.node');
    expect(top?.open).toBe(true);
    const child = top?.querySelector<HTMLDetailsElement>('details.node');
    expect(child?.open).toBe(false);
  });

  it('re-render replaces the previous tree', () => {
    renderNodeTree(host, nodes);
    renderNodeTree(host, nodes);
    expect(host.querySelectorAll(':scope > details.node')).toHaveLength(1);
  });
});
