import { describe, it, expect, afterEach } from 'vitest';
import { recordWrite } from '../../scripts/dl/journal';
import { refOf } from '../../scripts/dl/refs';
import {
  makeRepo,
  writeDoc,
  writeComment,
  writeResolvedMarker,
  commit,
  runDl,
  cleanup,
  headCount,
  authorEmailOf,
  subjectOf,
  MODEL_AUTHOR,
  RJS_AUTHOR,
} from './helpers';

// Packages B2 / B4 / B5 (integration) — `dl agenda` through the CLI.

let ws: string;
afterEach(async () => {
  if (ws) await cleanup(ws);
});

describe('dl agenda — dangling-draft recovery (B2)', () => {
  it('commits a dirty human draft as its own turn, warns, and folds it into the delta', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', '# Doc\n\noriginal line\n');
    await commit(ws, 'model turn', { author: MODEL_AUTHOR, date: '2026-07-05T10:00:00' });
    const before = await headCount(ws);

    // Uncommitted human edit in the working tree.
    await writeDoc(ws, 'doc.md', '# Doc\n\nHUMAN EDITED line\n');
    const r = await runDl(ws, ['agenda']);
    expect(r.code).toBe(0);

    expect(await headCount(ws)).toBe(before + 1); // recovery commit created
    expect(await authorEmailOf(ws, 'HEAD')).toBe('rjs@docloop');
    expect(await subjectOf(ws, 'HEAD')).toBe('turn (rjs): recovered draft');
    expect(r.stderr).toMatch(/recovered uncommitted human draft/i);
    expect(r.stdout).toContain('HUMAN EDITED line'); // folded into the reported delta
  });

  it('a clean tree creates no commit and reports nothing-new', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', '# Doc\n\nbody\n');
    await commit(ws, 'model turn', { author: MODEL_AUTHOR, date: '2026-07-05T10:00:00' });
    const before = await headCount(ws);

    const r = await runDl(ws, ['agenda']);
    expect(r.code).toBe(0);
    expect(await headCount(ws)).toBe(before);
    expect(r.stdout).toMatch(/nothing new/i);
  });

  it('a mid-model-turn re-run (journal matches the dirt) does NOT commit, warns model-turn-in-progress', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', '# Doc\n\nbody\n');
    await commit(ws, 'model turn', { author: MODEL_AUTHOR, date: '2026-07-05T10:00:00' });
    const before = await headCount(ws);

    // The model already wrote this turn: journal records refOf(the on-disk bytes).
    const inProgress = '# Doc\n\nbody edited by the model this turn\n';
    await writeDoc(ws, 'doc.md', inProgress);
    recordWrite(ws, 'doc.md', refOf(inProgress));

    const r = await runDl(ws, ['agenda']);
    expect(await headCount(ws)).toBe(before); // NOT committed as a human draft
    expect(r.stderr).toMatch(/model turn in progress/i);
  });
});

describe('dl agenda — thread triage (B4)', () => {
  const T2_TAIL = 'UNCHANGEDTHREADTAILTOKEN';

  async function scenario(): Promise<void> {
    ws = await makeRepo();
    // Boundary state (model turn @ 2026-07-05): four anchored threads.
    await writeDoc(
      ws,
      'design.md',
      '# Design\n\n## Section one\n\nAlpha discussion of :mark[the audit lottery]{#t1} here.\n\n## Section two\n\nBeta note on :mark[twin dispatch]{#t2}, plus :mark[old idea]{#t4} pending.\n',
    );
    await writeDoc(ws, 'plan.md', '# Plan\n\nPlanning around :mark[the floor pass]{#t3} idea.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'original question about the lottery' });
    await writeComment(ws, 't2', 1, {
      author: 'rjs',
      created: '2026-07-01T09:00:00.000Z',
      body: `twin dispatch concern that runs long enough to exceed the eighty character snippet cutoff ${T2_TAIL}`,
    });
    await writeComment(ws, 't3', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'floor pass note' });
    await writeComment(ws, 't4', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'old idea worth removing' });
    await commit(ws, 'model turn', { author: MODEL_AUTHOR, date: '2026-07-05T10:00:00' });

    // Human turn @ 2026-07-06: new comment on t1; resolve t4 (unwrap + marker).
    await writeDoc(
      ws,
      'design.md',
      '# Design\n\n## Section one\n\nAlpha discussion of :mark[the audit lottery]{#t1} here.\n\n## Section two\n\nBeta note on :mark[twin dispatch]{#t2}, plus old idea resolved.\n',
    );
    await writeComment(ws, 't1', 2, {
      author: 'rjs',
      created: '2026-07-06T09:00:00.000Z',
      body: 'FOLLOWUP with the full detailed reasoning FULLBODYTOKENT1 that must appear in full',
    });
    await writeResolvedMarker(ws, 't4', { author: 'rjs', created: '2026-07-06T09:00:00.000Z', note: 'conceded and folded RESOLVENOTE4' });
    await commit(ws, 'turn (rjs): reply and resolve', { author: RJS_AUTHOR, date: '2026-07-06T10:00:00' });
  }

  it('a new human comment on an old thread → changed, full bodies', async () => {
    await scenario();
    const r = await runDl(ws, ['agenda']);
    expect(r.stdout).toContain('t1');
    expect(r.stdout).toContain('FULLBODYTOKENT1'); // full body of the new comment
  });

  it('an untouched open thread → one-liner only (far tail of its body absent)', async () => {
    await scenario();
    const r = await runDl(ws, ['agenda']);
    expect(r.stdout).toContain('t2');
    expect(r.stdout).not.toContain(T2_TAIL); // body truncated, not rendered in full
  });

  it('a thread resolved by a human since the boundary → listed as resolved with the note', async () => {
    await scenario();
    const r = await runDl(ws, ['agenda']);
    expect(r.stdout).toContain('t4');
    expect(r.stdout).toContain('RESOLVENOTE4');
  });

  it('a marker resolved by the model itself since B is NOT listed as "resolved by rjs" (plan B4: author ≠ the model)', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', '# Design\n\nA :mark[self resolved]{#t8} span.\n');
    await writeComment(ws, 't8', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'model turn', { author: MODEL_AUTHOR, date: '2026-07-05T10:00:00' });
    // Human turn carries a resolve marker authored by the model side (as `dl
    // resolve` itself writes) and the anchor unwrapped.
    await writeDoc(ws, 'design.md', '# Design\n\nA self resolved span.\n');
    await writeResolvedMarker(ws, 't8', { author: 'claude', created: '2026-07-06T09:00:00.000Z', note: 'MODELRESOLVEDNOTE' });
    await commit(ws, 'turn (rjs): carries a model-authored marker', { author: RJS_AUTHOR, date: '2026-07-06T10:00:00' });

    const r = await runDl(ws, ['agenda']);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain('MODELRESOLVEDNOTE');
    expect(r.stdout).not.toMatch(/resolved by rjs[\s\S]*t8/);
  });

  it('multi-doc: a thread anchored in plan.md is reported under plan.md', async () => {
    await scenario();
    const r = await runDl(ws, ['agenda']);
    // t3 lives in plan.md; its section/heading must name plan.md, not design.md.
    expect(r.stdout).toMatch(/plan\.md[\s\S]*t3|t3[\s\S]*plan\.md/);
  });

  it('a thread resolved BEFORE the boundary is not listed', async () => {
    ws = await makeRepo();
    // Filler prose must not contain the literal thread id: the human edit below
    // legitimately surfaces this paragraph in the prose delta, and the strict
    // not.toContain('t5') assertion would collide with its own fixture
    // (adjudicated 2026-07-10; was a test defect, not an implementation bug).
    await writeDoc(ws, 'design.md', '# Design\n\nplain prose, long since settled.\n');
    await writeComment(ws, 't5', 1, { author: 'rjs', created: '2026-06-01T09:00:00.000Z', body: 'long settled' });
    await writeResolvedMarker(ws, 't5', { author: 'rjs', created: '2026-06-02T09:00:00.000Z', note: 'ancient history' });
    await commit(ws, 'model turn', { author: MODEL_AUTHOR, date: '2026-07-05T10:00:00' });
    await writeDoc(ws, 'design.md', '# Design\n\nplain prose EDITED, long since settled.\n');
    await commit(ws, 'turn (rjs): edit', { author: RJS_AUTHOR, date: '2026-07-06T10:00:00' });

    const r = await runDl(ws, ['agenda']);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain('t5');
    expect(r.stdout).not.toContain('ancient history');
  });

  it('legacy: a thread dir deleted outright between B and HEAD is listed as resolved with no note, no crash', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', '# Design\n\nA :mark[legacy span]{#t6} anchor.\n');
    await writeComment(ws, 't6', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'pre-marker data' });
    await commit(ws, 'model turn', { author: MODEL_AUTHOR, date: '2026-07-05T10:00:00' });
    // Human turn under the OLD store: anchor unwrapped AND dir deleted.
    await writeDoc(ws, 'design.md', '# Design\n\nA legacy span anchor.\n');
    const { rm } = await import('node:fs/promises');
    const { join } = await import('node:path');
    await rm(join(ws, 'threads', 't6'), { recursive: true, force: true });
    await commit(ws, 'turn (rjs): old-style resolve', { author: RJS_AUTHOR, date: '2026-07-06T10:00:00' });

    const r = await runDl(ws, ['agenda']);
    expect(r.code).toBe(0); // no crash
    expect(r.stdout).toContain('t6'); // listed as resolved
  });

  it('a thread opened AND resolved by the model itself since B: classified resolved, never awaiting, no crash', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', '# Design\n\nplain prose only.\n');
    await commit(ws, 'model turn', { author: MODEL_AUTHOR, date: '2026-07-05T10:00:00' });
    // Data says: thread created and resolved after B, marker authored by the model side.
    await writeComment(ws, 't7', 1, { author: 'claude', created: '2026-07-06T09:00:00.000Z', body: 'self-opened' });
    await writeResolvedMarker(ws, 't7', { author: 'claude', created: '2026-07-06T09:30:00.000Z', note: 'self-resolved' });
    await commit(ws, 'turn (rjs): carries odd data', { author: RJS_AUTHOR, date: '2026-07-06T10:00:00' });

    const r = await runDl(ws, ['agenda']);
    expect(r.code).toBe(0); // no crash
    expect(r.stdout).not.toMatch(/awaiting[\s\S]*t7/); // never in the awaiting section
  });
});

describe('dl agenda — golden output (B5)', () => {
  it('nothing-to-do state prints a single line and exits 0', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', '# Doc\n\nbody\n');
    await commit(ws, 'model turn', { author: MODEL_AUTHOR, date: '2026-07-05T10:00:00' });
    const r = await runDl(ws, ['agenda']);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toMatch(/^agenda: nothing new since [0-9a-f]+$/);
  });

  it('golden snapshot of a scripted two-human-turn scenario', async () => {
    // Deterministic: fixed authors, dates, ids => stable boundary shortsha.
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', '# Design\n\nDesign alpha original.\n');
    await writeDoc(ws, 'plan.md', '# Plan\n\nPlan alpha original.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'first note' });
    await commit(ws, 'model turn', { author: MODEL_AUTHOR, date: '2026-07-05T10:00:00' });

    // Human turn 1: edits both docs, replies to t1, opens t2, resolves nothing.
    await writeDoc(ws, 'design.md', '# Design\n\nDesign alpha EDITED by human.\n');
    await writeDoc(ws, 'plan.md', '# Plan\n\nPlan alpha EDITED by human.\n');
    await writeComment(ws, 't1', 2, { author: 'rjs', created: '2026-07-06T09:00:00.000Z', body: 'human reply on t1' });
    await writeComment(ws, 't2', 1, { author: 'rjs', created: '2026-07-06T09:05:00.000Z', body: 'brand new t2 thread' });
    await commit(ws, 'turn (rjs): first human turn', { author: RJS_AUTHOR, date: '2026-07-06T10:00:00' });

    // Human turn 2: an uncommitted draft (recovered by agenda).
    await writeDoc(ws, 'design.md', '# Design\n\nDesign alpha EDITED again as a draft.\n');

    const r = await runDl(ws, ['agenda']);
    expect(r.code).toBe(0);
    // Non-snapshot safety net: header names the boundary + folds the human turns.
    expect(r.stdout).toMatch(/# agenda \(since [0-9a-f]+ ".*", \d+ human turns? folded\)/);
    // The sanctioned golden file (plan B5). Implementer reviews on first run.
    expect(r.stdout).toMatchSnapshot();
  });
});
