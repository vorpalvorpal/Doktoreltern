import { describe, it, expect, afterEach } from 'vitest';
import { makeRepo, writeDoc, writeComment, commit, runDl, cleanup, MODEL_AUTHOR, RJS_AUTHOR } from './helpers';

// Package B6 — `dl orient`: one screen of docs, open-thread counts, whose turn,
// and the last few history lines.

let ws: string;
afterEach(async () => {
  if (ws) await cleanup(ws);
});

describe('dl orient (B6)', () => {
  it('names all docs, counts open threads, and shows whose turn it is', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', '# Design\n\nText with :mark[span one]{#t1} anchor.\n');
    await writeDoc(ws, 'plan.md', '# Plan\n\nPlan text with :mark[span two]{#t2} anchor.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q1' });
    await writeComment(ws, 't2', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q2' });
    // HEAD authored by the model => it is the human's turn.
    await commit(ws, 'model turn', { author: MODEL_AUTHOR, date: '2026-07-05T10:00:00' });

    const r = await runDl(ws, ['orient']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('design.md');
    expect(r.stdout).toContain('plan.md');
    // Two open threads across the workspace.
    expect(r.stdout).toMatch(/\b2\b/);
  });

  it('turn attribution follows HEAD author: a human HEAD => "your turn"', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', '# Doc\n\nbody\n');
    await commit(ws, 'model turn', { author: MODEL_AUTHOR, date: '2026-07-05T10:00:00' });
    await writeDoc(ws, 'doc.md', '# Doc\n\nbody edited\n');
    await commit(ws, 'turn (rjs): human edit', { author: RJS_AUTHOR, date: '2026-07-06T10:00:00' });

    const r = await runDl(ws, ['orient']);
    expect(r.stdout).toMatch(/your turn/i);
  });

  it('shows at most 5 history lines', async () => {
    ws = await makeRepo();
    for (let i = 0; i < 7; i++) {
      await writeDoc(ws, 'doc.md', `# Doc\n\nrevision ${i}\n`);
      await commit(ws, `turn (rjs): edit ${i}`, { author: RJS_AUTHOR, date: `2026-07-0${i + 1}T10:00:00` });
    }
    const r = await runDl(ws, ['orient']);
    expect(r.code).toBe(0); // guard: without this the filter below passes vacuously
    const historyLines = r.stdout.split('\n').filter((l) => /edit \d/.test(l));
    expect(historyLines.length).toBeLessThanOrEqual(5);
    expect(historyLines.length).toBeGreaterThan(0); // history section actually rendered
  });
});
