import { describe, it, expect, afterEach } from 'vitest';
import { lastModelCommit, docAt } from '../../scripts/dl/gitio';
import { makeRepo, writeDoc, commit, cleanup, MODEL_AUTHOR, RJS_AUTHOR } from './helpers';

// Package B1 — agenda boundary detection + point-in-time doc reads.

let ws: string;
afterEach(async () => {
  if (ws) await cleanup(ws);
});

describe('lastModelCommit (B1)', () => {
  it('returns the NEWEST model-authored commit, not HEAD, when humans committed on top', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', 'v0\n');
    await commit(ws, 'turn (rjs): initial', { author: RJS_AUTHOR, date: '2026-07-01T10:00:00' });
    await writeDoc(ws, 'doc.md', 'v1\n');
    const modelSha = await commit(ws, 'model turn', { author: MODEL_AUTHOR, date: '2026-07-02T10:00:00' });
    await writeDoc(ws, 'doc.md', 'v2\n');
    await commit(ws, 'turn (rjs): reply', { author: RJS_AUTHOR, date: '2026-07-03T10:00:00' });

    const found = await lastModelCommit(ws);
    expect(found).not.toBeNull();
    // Compare against the model commit's full sha.
    expect(found).toContain(modelSha.slice(0, 7));
  });

  it('legacy fallback: newest subject matching /^C turn:/ under a default author', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', 'v0\n');
    await commit(ws, 'C turn: legacy model turn', { author: RJS_AUTHOR, date: '2026-06-01T10:00:00' });
    await writeDoc(ws, 'doc.md', 'v1\n');
    await commit(ws, 'turn (rjs): human on top', { author: RJS_AUTHOR, date: '2026-06-02T10:00:00' });

    expect(await lastModelCommit(ws)).not.toBeNull();
  });

  it('an all-human repo (no model commit, no legacy subject) → null', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', 'v0\n');
    await commit(ws, 'turn (rjs): only human turns', { author: RJS_AUTHOR });
    expect(await lastModelCommit(ws)).toBeNull();
  });
});

describe('docAt (B1)', () => {
  it('returns the doc bytes at a given revision', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', 'first\n');
    const sha = await commit(ws, 'c1');
    await writeDoc(ws, 'doc.md', 'second\n');
    await commit(ws, 'c2');
    expect(await docAt(ws, sha, 'doc.md')).toBe('first\n');
  });

  it("returns '' when the doc does not exist at that revision", async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', 'only doc\n');
    const sha = await commit(ws, 'c1');
    expect(await docAt(ws, sha, 'not-created-yet.md')).toBe('');
  });

  it('a null revision (no boundary) reads against the empty tree → empty string', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', 'x\n');
    await commit(ws, 'c1');
    expect(await docAt(ws, null, 'doc.md')).toBe('');
  });
});
