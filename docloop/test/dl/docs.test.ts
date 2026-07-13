/**
 * Doc discovery (`scripts/dl/docs.ts` trackedDocs): tracked top-level `*.md`
 * only. Pins that nothing nested is ever a doc — in particular the parked
 * docs under `archive/` (the 2026-07 restructure) and the `threads/` store —
 * and that untracked top-level files aren't docs either.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { trackedDocs } from '../../scripts/dl/docs';
import { makeRepo, writeDoc, commit, cleanup } from './helpers';

let ws: string;

afterEach(async () => {
  if (ws) await cleanup(ws);
});

describe('trackedDocs', () => {
  it('lists only tracked top-level *.md — archive/ and threads/ are excluded', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'whiteboard.md', 'live\n');
    await writeDoc(ws, 'archive/design.md', 'drained\n');
    await writeDoc(ws, 'archive/plan.md', 'drained\n');
    await writeDoc(ws, 'threads/t1/0001.md', '---\nauthor: rjs\ncreated: x\n---\nbody\n');
    await commit(ws, 'seed'); // add -A: everything above is tracked

    expect(await trackedDocs(ws)).toEqual(['whiteboard.md']);
  });

  it('untracked top-level *.md files are not docs', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'tracked.md', 'in\n');
    await commit(ws, 'seed');
    await writeDoc(ws, 'untracked.md', 'out\n');

    expect(await trackedDocs(ws)).toEqual(['tracked.md']);
  });
});
