/**
 * Package E: the node-store directory walker (src/nodes-fs.ts) — the pure-fs
 * half of the GET /nodes seam. Schema-agnostic v1: one entry per directory,
 * title = basename, state = 'unknown', *.md files listed per directory.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readNodeTree, type NodeEntry } from '../src/nodes-fs';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'docloop-nodes-fs-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('readNodeTree', () => {
  it('empty root → no entries', async () => {
    expect(await readNodeTree(root)).toEqual([]);
  });

  it('one entry per directory; the root itself is not an entry', async () => {
    await mkdir(join(root, 'alpha'));
    await mkdir(join(root, 'beta', 'gamma'), { recursive: true });
    const tree = await readNodeTree(root);
    expect(tree.map((n) => n.id)).toEqual(['alpha', 'beta']);
    expect(tree[1].children.map((c) => c.id)).toEqual(['beta/gamma']);
  });

  it('titles are basenames, states are unknown, children sorted by title', async () => {
    await mkdir(join(root, 'p', 'zz'), { recursive: true });
    await mkdir(join(root, 'p', 'aa'), { recursive: true });
    const [p] = await readNodeTree(root);
    expect(p.title).toBe('p');
    expect(p.state).toBe('unknown');
    expect(p.children.map((c) => c.title)).toEqual(['aa', 'zz']);
  });

  it('lists only *.md files, sorted; ignores other files and dot-files', async () => {
    await mkdir(join(root, 'n'));
    await writeFile(join(root, 'n', 'b.md'), '', 'utf8');
    await writeFile(join(root, 'n', 'a.md'), '', 'utf8');
    await writeFile(join(root, 'n', 'data.json'), '{}', 'utf8');
    await writeFile(join(root, 'n', '.secret.md'), '', 'utf8');
    const [n] = await readNodeTree(root);
    expect(n.docs).toEqual(['a.md', 'b.md']);
  });

  it('skips dot-directories entirely', async () => {
    await mkdir(join(root, '.git', 'objects'), { recursive: true });
    await mkdir(join(root, 'real'));
    const tree = await readNodeTree(root);
    expect(tree.map((n) => n.id)).toEqual(['real']);
  });

  it('caps at depth 12: deeper directories are ignored, not an error', async () => {
    // Build a 14-deep chain d1/d2/…/d14.
    const parts = Array.from({ length: 14 }, (_, i) => `d${i + 1}`);
    await mkdir(join(root, ...parts), { recursive: true });
    const tree = await readNodeTree(root);
    let node: NodeEntry | undefined = tree[0];
    let depth = 0;
    while (node) {
      depth += 1;
      node = node.children[0];
    }
    expect(depth).toBe(12);
  });

  it('does not follow directory symlinks', async () => {
    await mkdir(join(root, 'target', 'inner'), { recursive: true });
    try {
      await symlink(join(root, 'target'), join(root, 'link'), 'dir');
    } catch {
      return; // platform without symlink permission — nothing to assert
    }
    const tree = await readNodeTree(root);
    expect(tree.map((n) => n.id)).toEqual(['target']);
  });
});
