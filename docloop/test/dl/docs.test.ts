/**
 * Doc discovery (`scripts/dl/docs.ts`): tracked `*.md` files, recursively,
 * each identified by its workspace-relative posix path. `isDocPath` /
 * `isDocDir` are THE discovery/traversal rule shared by dl, the API and the
 * walkers: never `threads/` (the sidecar store), never `archive/` (parked
 * docs), never dot-paths or traversal, never backslashes, never non-`.md`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { trackedDocs, isDocPath, isDocDir } from '../../scripts/dl/docs';
import { makeRepo, writeDoc, commit, cleanup } from './helpers';

let ws: string;

afterEach(async () => {
  if (ws) await cleanup(ws);
});

describe('isDocPath', () => {
  const accepted = ['a.md', 'nodes/16/design.md'];
  for (const path of accepted) {
    it(`accepts ${JSON.stringify(path)}`, () => {
      expect(isDocPath(path)).toBe(true);
    });
  }

  const rejected = [
    'threads/t1/0001.md', // the sidecar store
    'archive/x.md', // parked docs
    '.hidden.md', // dot file
    'a/.b/c.md', // dot segment mid-path
    '../x.md', // traversal out of the workspace
    'a/../b.md', // traversal via an inner dot-dot segment
    'a//b.md', // empty segment
    'a\\b.md', // backslash path
    'x.txt', // not markdown
    'turn.xml', // GUI-owned working state
    '', // empty
  ];
  for (const path of rejected) {
    it(`rejects ${JSON.stringify(path)}`, () => {
      expect(isDocPath(path)).toBe(false);
    });
  }
});

describe('isDocDir', () => {
  it('accepts ordinary nested directories', () => {
    expect(isDocDir('nodes')).toBe(true);
    expect(isDocDir('nodes/16')).toBe(true);
  });

  it('rejects the excluded top-level roots, but only at the top level', () => {
    expect(isDocDir('threads')).toBe(false);
    expect(isDocDir('archive')).toBe(false);
    expect(isDocDir('archive/deep')).toBe(false);
    // A NESTED archive/ or threads/ is not the excluded root.
    expect(isDocDir('nodes/archive')).toBe(true);
    expect(isDocDir('nodes/threads')).toBe(true);
  });

  it('rejects dot segments, empty segments, and backslashes', () => {
    expect(isDocDir('.git')).toBe(false);
    expect(isDocDir('a/.cache')).toBe(false);
    expect(isDocDir('..')).toBe(false);
    expect(isDocDir('a//b')).toBe(false);
    expect(isDocDir('a\\b')).toBe(false);
  });
});

describe('trackedDocs', () => {
  it('lists tracked *.md recursively as path-qualified ids — archive/ and threads/ excluded', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'whiteboard.md', 'live\n');
    await writeDoc(ws, 'nodes/16/design.md', 'nested live\n');
    await writeDoc(ws, 'archive/design.md', 'drained\n');
    await writeDoc(ws, 'archive/plan.md', 'drained\n');
    await writeDoc(ws, 'threads/t1/0001.md', '---\nauthor: rjs\ncreated: x\n---\nbody\n');
    await commit(ws, 'seed'); // add -A: everything above is tracked

    expect(await trackedDocs(ws)).toEqual(['nodes/16/design.md', 'whiteboard.md']);
  });

  it('untracked *.md files are not docs (top-level or nested)', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'tracked.md', 'in\n');
    await commit(ws, 'seed');
    await writeDoc(ws, 'untracked.md', 'out\n');
    await writeDoc(ws, 'nodes/17/untracked.md', 'out\n');

    expect(await trackedDocs(ws)).toEqual(['tracked.md']);
  });
});
