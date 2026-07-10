import { describe, it, expect, afterEach } from 'vitest';
import { parseTurnRecord } from '../../scripts/dl/commitcore';
import { refOf } from '../../scripts/dl/refs';
import { canonicalize } from '../../scripts/dl/canonical';
import {
  makeRepo,
  writeDoc,
  readDoc,
  writeComment,
  commit,
  runDl,
  cleanup,
  headCount,
  authorEmailOf,
  bodyOf,
  status,
  RJS_AUTHOR,
} from './helpers';

// Package C2 — transactional `dl commit` + the turn record (commit-message body).

let ws: string;
afterEach(async () => {
  if (ws) await cleanup(ws);
});

const CANON = '# Doc\n\npara one\n\npara two\n\npara three\n';
// para two is the block a `dl edit` replaces below; the anchor lives in its own
// block so the edit never disturbs it.
const CANON_WITH_ANCHOR = '# Doc\n\npara one\n\npara two\n\nA :mark[flagged bit]{#t1} note.\n';

describe('parseTurnRecord (C2)', () => {
  it('round-trips the turn-record YAML body the builder emits', () => {
    const body = [
      'docloop-turn: 1',
      'docs:',
      '  design.md: {before: a3f21c4e, after: 9e12ab34}',
      'threads:',
      '  opened: [t26]',
      '  replied: [t17, t9]',
      '  resolved:',
      '    - {id: t4, note: "conceded — folded into §3"}',
      'recovered-draft: false',
    ].join('\n');
    const rec = parseTurnRecord(body);
    expect(rec.docs['design.md']).toEqual({ before: 'a3f21c4e', after: '9e12ab34' });
    expect(rec.threads.opened).toEqual(['t26']);
    expect(rec.threads.replied).toEqual(['t17', 't9']);
    expect(rec.threads.resolved).toContainEqual({ id: 't4', note: 'conceded — folded into §3' });
    expect(rec.recoveredDraft ?? rec['recovered-draft']).toBe(false);
  });
});

describe('dl commit — happy path (C2)', () => {
  it('commits as the model author, writes a parseable turn record, clears scratch', async () => {
    // Four sequential CLI invocations (edit, reply, commit, commit again),
    // each a fresh vite-node process — comfortably over the 5s default under load.
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON_WITH_ANCHOR);
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'turn (rjs): seed', { author: RJS_AUTHOR });
    const before = await headCount(ws);

    // A real dl edit populates the journal so commit has something to stage,
    // plus a reply (C3) to exercise a thread-file journal entry alongside it.
    const edit = await runDl(ws, ['edit', `doc.md@${refOf(CANON_WITH_ANCHOR)}`], '@@ replace 3\nREPLACED two\n');
    expect(edit.code).toBe(0);
    const reply = await runDl(ws, ['reply', 't1'], 'a model reply');
    expect(reply.code).toBe(0);

    const c = await runDl(ws, ['commit', '-m', 'turn: model reply']);
    expect(c.code).toBe(0);
    expect(c.stdout).toMatch(/^committed [0-9a-f]+ \(\d+ docs?, \d+ threads?\)/m);

    expect(await headCount(ws)).toBe(before + 1);
    expect(await authorEmailOf(ws, 'HEAD')).toBe('model@docloop');

    const rec = parseTurnRecord(await bodyOf(ws, 'HEAD'));
    expect(rec.docs['doc.md']).toBeTruthy();
    // The reply journalled a threads/t1/0002.md write too — the docs map must
    // hold only top-level doc names, never thread-store paths.
    expect(Object.keys(rec.docs)).toEqual(['doc.md']);
    expect(rec.threads.replied).toContain('t1');

    // Scratch cleared => a second commit with no new writes refuses.
    const c2 = await runDl(ws, ['commit', '-m', 'again']);
    expect(c2.code).toBe(1);
  }, 15000);

  it('carries a resolve --note through the journal into the turn record', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', '# Doc\n\nA :mark[flagged text]{#t1} here.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'turn (rjs): seed', { author: RJS_AUTHOR });

    const res = await runDl(ws, ['resolve', 't1', '--note', 'conceded — folded in']);
    expect(res.code).toBe(0);

    const c = await runDl(ws, ['commit', '-m', 'turn: resolve t1']);
    expect(c.code).toBe(0);
    const rec = parseTurnRecord(await bodyOf(ws, 'HEAD'));
    expect(rec.threads.resolved).toContainEqual({ id: 't1', note: 'conceded — folded in' });
  });
});

describe('dl commit — guards (C2)', () => {
  it('refuses when no dl writes happened this turn (no journal)', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'turn (rjs): seed', { author: RJS_AUTHOR });
    const c = await runDl(ws, ['commit', '-m', 'nothing to do']);
    expect(c.code).toBe(1);
    expect(c.stderr).toMatch(/no dl writes this turn|nothing to commit/i);
  });

  it('refuses on a foreign edit (file changed after the last dl write), naming the file', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'turn (rjs): seed', { author: RJS_AUTHOR });
    await runDl(ws, ['edit', `doc.md@${refOf(CANON)}`], '@@ replace 3\nmodel edit\n');
    const before = await headCount(ws);

    // A human clobbers the file after dl wrote it.
    await writeDoc(ws, 'doc.md', '# Doc\n\nhuman clobbered everything\n');

    const c = await runDl(ws, ['commit', '-m', 'should refuse']);
    expect(c.code).toBe(1);
    expect(c.stderr).toContain('doc.md');
    expect(await headCount(ws)).toBe(before); // nothing committed
  });

  it('refuses on a foreign edit under threads/ (a thread comment file touched after the last dl write), naming the file', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', '# Doc\n\nA :mark[flagged text]{#t1} here.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'turn (rjs): seed', { author: RJS_AUTHOR });

    const reply = await runDl(ws, ['reply', 't1'], 'model reply');
    expect(reply.code).toBe(0);
    const before = await headCount(ws);

    // A human hand-edits the thread comment dl just wrote, mid-turn.
    await writeComment(ws, 't1', 2, { author: 'rjs', created: '2026-07-09T09:00:00.000Z', body: 'HAND EDITED' });

    const c = await runDl(ws, ['commit', '-m', 'should refuse']);
    expect(c.code).toBe(1);
    expect(c.stderr).toContain('threads/t1/0002.md');
    expect(await headCount(ws)).toBe(before); // nothing committed
  });

  it('refuses on an untracked new tracked-pattern file created by hand, unless --allow-manual (which also canonicalises it)', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'turn (rjs): seed', { author: RJS_AUTHOR });
    await runDl(ws, ['edit', `doc.md@${refOf(CANON)}`], '@@ replace 3\nmodel edit\n');
    const before = await headCount(ws);

    // A hand-created new top-level .md the journal knows nothing about, and
    // deliberately NOT canonical (sloppy heading/list spacing).
    await writeDoc(ws, 'sneaky.md', '#   Sneaky Heading\n\n*    loose    bullet\n');

    const refuse = await runDl(ws, ['commit', '-m', 'should refuse']);
    expect(refuse.code).toBe(1);
    expect(await headCount(ws)).toBe(before);

    // Escape hatch: --allow-manual skips the foreign-edit guard, then
    // canonicalises the hand-edited doc before check/stage.
    const allowed = await runDl(ws, ['commit', '-m', 'turn: manual ok', '--allow-manual']);
    expect(allowed.code).toBe(0);
    expect(await headCount(ws)).toBe(before + 1);

    const committed = await readDoc(ws, 'sneaky.md');
    expect(committed).not.toBe('#   Sneaky Heading\n\n*    loose    bullet\n');
    expect(await canonicalize(committed)).toBe(committed);
  });

  it('refuses on a checkcore ERROR (orphaned thread), leaving the index clean', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    // The orphan (thread dir, no live anchor, no marker) is part of the SEED
    // commit, so the foreign-edit guard passes and the refusal is checkcore's.
    await writeComment(ws, 't42', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'orphan' });
    await commit(ws, 'turn (rjs): seed', { author: RJS_AUTHOR });
    await runDl(ws, ['edit', `doc.md@${refOf(CANON)}`], '@@ replace 3\nmodel edit\n');
    const before = await headCount(ws);
    const stBefore = await status(ws);

    const c = await runDl(ws, ['commit', '-m', 'should refuse']);
    expect(c.code).toBe(1);
    expect(await headCount(ws)).toBe(before); // no commit
    expect(await status(ws)).toBe(stBefore); // index untouched by the attempt
  });

  it('never stages turn.xml and turn.xml never blocks the commit', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'turn (rjs): seed', { author: RJS_AUTHOR });
    await runDl(ws, ['edit', `doc.md@${refOf(CANON)}`], '@@ replace 3\nmodel edit\n');
    // A dirty turn.xml in the tree must be ignored entirely.
    await writeDoc(ws, 'turn.xml', '<turn>stale</turn>\n');

    const c = await runDl(ws, ['commit', '-m', 'turn: ignores turn.xml']);
    expect(c.code).toBe(0);
    // turn.xml still present & uncommitted (untracked/dirty), never staged.
    const st = await status(ws);
    expect(st).toMatch(/turn\.xml/);
    expect(await readDoc(ws, 'turn.xml')).toContain('stale');
  });
});
