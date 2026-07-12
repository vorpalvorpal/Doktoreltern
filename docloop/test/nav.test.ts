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
