import { describe, it, expect, afterEach } from 'vitest';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { recordWrite, recordThread, readScratch, clearScratch } from '../../scripts/dl/journal';
import { makeRepo, cleanup } from './helpers';

// Package A4 — the per-turn scratch journal under <ws>/.git/docloop/turn.json.
// Needs a git repo only for the .git dir to exist.

let ws: string;
afterEach(async () => {
  if (ws) await cleanup(ws);
});

async function exists(p: string): Promise<boolean> {
  return access(p).then(() => true, () => false);
}

describe('journal round-trip (A4)', () => {
  it('record -> read returns what was recorded; clear -> read returns null', async () => {
    ws = await makeRepo();
    recordWrite(ws, 'design.md', 'hash-A');
    recordThread(ws, 'opened', 't26');
    recordThread(ws, 'replied', 't17');
    recordThread(ws, 'resolved', 't4', 'conceded — folded into §3');

    const s = readScratch(ws);
    expect(s).not.toBeNull();
    expect(s!.writes['design.md']).toBe('hash-A');
    expect(s!.threads.opened).toContain('t26');
    expect(s!.threads.replied).toContain('t17');
    expect(s!.threads.resolved).toContainEqual({ id: 't4', note: 'conceded — folded into §3' });

    clearScratch(ws);
    expect(readScratch(ws)).toBeNull();
  });

  it('recordWrite twice for one path keeps only the latest hash', async () => {
    ws = await makeRepo();
    recordWrite(ws, 'plan.md', 'hash-1');
    recordWrite(ws, 'plan.md', 'hash-2');
    const s = readScratch(ws);
    expect(s!.writes['plan.md']).toBe('hash-2');
    expect(Object.keys(s!.writes)).toEqual(['plan.md']);
  });

  it('persists under <ws>/.git/docloop/, auto-creating the directory', async () => {
    ws = await makeRepo();
    recordWrite(ws, 'design.md', 'h');
    expect(await exists(join(ws, '.git', 'docloop', 'turn.json'))).toBe(true);
  });

  it('readScratch on a fresh repo (no writes yet) returns null', async () => {
    ws = await makeRepo();
    expect(readScratch(ws)).toBeNull();
  });
});
