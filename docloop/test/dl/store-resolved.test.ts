import { describe, it, expect, afterEach } from 'vitest';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import {
  resolveThread,
  listThreads,
  readThread,
  addComment,
} from '../../src/threads-store';
import { nextThreadId } from '../../src/threads';
import { renderTurn } from '../../src/turn';
import type { Thread } from '../../src/threads-store';
import { makeDir, cleanup } from './helpers';

// Package C0 — resolved threads are MARKED, not deleted (spec decision 9).
// These pin the NEW behaviour of src/threads-store.ts; the existing
// threads-store/api/thread-cli tests assert the OLD delete-on-resolve behaviour
// and will need reconciling (see COVERAGE.md conflict list). We do not touch them.

let base: string; // the threads/ dir
afterEach(async () => {
  if (base) await cleanup(base);
});

async function exists(p: string): Promise<boolean> {
  return access(p).then(() => true, () => false);
}

describe('resolveThread — marks in place (C0)', () => {
  it('writes threads/<id>/resolved.md and leaves the directory + comments intact', async () => {
    base = await makeDir();
    await addComment(base, 't1', { author: 'rjs', body: 'the argument', created: '2026-07-01T09:00:00.000Z' });

    await resolveThread(base, 't1', { author: 'rjs', note: 'conceded — folded into §3' });

    expect(await exists(join(base, 't1', 'resolved.md'))).toBe(true);
    // Comment history survives (reasoning is not deleted).
    const t = await readThread(base, 't1');
    expect(t?.comments.map((c) => c.body)).toEqual(['the argument']);
  });

  it('the resolved marker carries author/created/note (comment-shaped frontmatter)', async () => {
    base = await makeDir();
    await addComment(base, 't1', { author: 'rjs', body: 'x', created: '2026-07-01T09:00:00.000Z' });
    await resolveThread(base, 't1', { author: 'claude', note: 'agreed' });

    const t = await listThreads(base);
    expect(t[0].resolved).toBeTruthy();
    expect(t[0].resolved!.author).toBe('claude');
    expect(t[0].resolved!.note).toBe('agreed');
    expect(Number.isNaN(Date.parse(t[0].resolved!.created))).toBe(false);
  });

  it('an empty note is allowed (marker present, note = "")', async () => {
    base = await makeDir();
    await addComment(base, 't1', { author: 'rjs', body: 'x', created: '2026-07-01T09:00:00.000Z' });
    await resolveThread(base, 't1', { author: 'rjs' });
    const t = await listThreads(base);
    expect(t[0].resolved).toBeTruthy();
    expect(t[0].resolved!.note).toBe('');
  });

  it('resolving a never-written thread still records the resolution (creates the dir)', async () => {
    base = await makeDir();
    await resolveThread(base, 't7', { author: 'rjs', note: 'no store existed' });
    expect(await exists(join(base, 't7', 'resolved.md'))).toBe(true);
  });

  it('resolving an already-resolved id overwrites the marker (last resolution wins)', async () => {
    base = await makeDir();
    await addComment(base, 't1', { author: 'rjs', body: 'x', created: '2026-07-01T09:00:00.000Z' });
    await resolveThread(base, 't1', { author: 'rjs', note: 'first' });
    await resolveThread(base, 't1', { author: 'rjs', note: 'second' });
    const t = await listThreads(base);
    expect(t[0].resolved!.note).toBe('second');
  });
});

describe('listThreads — resolved field (C0)', () => {
  it('unresolved threads have resolved === undefined', async () => {
    base = await makeDir();
    await addComment(base, 't1', { author: 'rjs', body: 'x', created: '2026-07-01T09:00:00.000Z' });
    const t = await listThreads(base);
    expect(t[0].resolved).toBeUndefined();
  });
});

describe('id allocation never reuses a resolved id (C0)', () => {
  it('a resolved t9 still counts toward the max, so the next id is t10', async () => {
    base = await makeDir();
    await addComment(base, 't9', { author: 'rjs', body: 'x', created: '2026-07-01T09:00:00.000Z' });
    await resolveThread(base, 't9', { author: 'rjs', note: 'done' });
    const ids = (await listThreads(base)).map((t) => t.id);
    expect(nextThreadId(ids)).toBe('t10');
  });
});

describe('renderTurn with a surviving resolved dir (C0)', () => {
  it('reports status="resolved" (anchor-driven) and no phantom opened/updated entry', () => {
    // Anchor gone this turn, but the store dir SURVIVES (marked resolved) — the
    // pre-C0 world deleted it. Rendering is anchor-driven, so the surviving dir
    // must not resurrect the thread as opened/updated.
    const oldMd = '# Notes\n\nA :mark[flagged span]{#t1} here.\n';
    const newMd = '# Notes\n\nA flagged span here.\n';
    const store: Thread[] = [
      {
        id: 't1',
        comments: [{ seq: 1, author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'x' }],
        resolved: { author: 'rjs', created: '2026-07-08T09:00:00.000Z', note: 'done' },
      } as unknown as Thread,
    ];
    const xml = renderTurn(oldMd, newMd, store, '2026-07-05T00:00:00.000Z');
    expect(xml).toMatch(/<thread id="t1"[^>]*status="resolved"/);
    expect(xml).not.toMatch(/<thread id="t1"[^>]*status="(opened|updated)"/);
  });
});
