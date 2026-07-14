import { describe, it, expect, afterEach } from 'vitest';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { listThreads } from '../../src/threads-store';
import { extractAnchors } from '../../src/threads';
import { readScratch } from '../../scripts/dl/journal';
import { canonicalize } from '../../scripts/dl/canonical';
import { refOf } from '../../scripts/dl/refs';
import {
  makeRepo,
  writeDoc,
  readDoc,
  writeComment,
  commit,
  runDl,
  cleanup,
} from './helpers';

// Package C3 — `dl reply`, `dl comment`, `dl resolve` ported to multi-doc, quiet
// output, journalling. Doc is always inferred from the anchor / span.

let ws: string;
afterEach(async () => {
  if (ws) await cleanup(ws);
});
async function exists(p: string): Promise<boolean> {
  return access(p).then(() => true, () => false);
}

describe('dl reply (C3)', () => {
  it('infers the doc holding the anchor and appends the comment (names plan.md)', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', '# Design\n\nno anchors here.\n');
    await writeDoc(ws, 'plan.md', '# Plan\n\nPlanning :mark[the floor pass]{#t3} idea.\n');
    await writeComment(ws, 't3', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');

    const r = await runDl(ws, ['reply', 't3'], 'here is my reply');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('t3');
    expect(r.stdout).toContain('plan.md'); // doc inferred correctly
    const t = await listThreads(join(ws, 'threads'));
    expect(t.find((x) => x.id === 't3')!.comments.map((c) => c.body)).toContain('here is my reply');
  });

  it('replying to an id with no anchor in any doc errors and leaves the store untouched', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', '# Design\n\nno anchors.\n');
    await commit(ws, 'seed');
    const r = await runDl(ws, ['reply', 't99'], 'x');
    expect(r.code).toBe(1);
    expect(await listThreads(join(ws, 'threads'))).toEqual([]);
  });
});

describe('dl comment (C3)', () => {
  it('a span present in two docs is ambiguous, naming both docs', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', '# Design\n\ncontains a shared span here.\n');
    await writeDoc(ws, 'plan.md', '# Plan\n\nalso contains a shared span here.\n');
    await commit(ws, 'seed');
    const r = await runDl(ws, ['comment', 'shared span'], 'why?');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/ambiguous/i);
    expect(r.stderr).toContain('design.md');
    expect(r.stderr).toContain('plan.md');
  });

  it('--doc narrows the span to one doc and emits t<id> → <doc>@<newref>', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', '# Design\n\ncontains a shared span here.\n');
    await writeDoc(ws, 'plan.md', '# Plan\n\nalso contains a shared span here.\n');
    await commit(ws, 'seed');
    const r = await runDl(ws, ['comment', 'shared span', '--doc', 'plan.md'], 'why?');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/t\d+\s*(?:→|->)\s*plan\.md@[0-9a-f]{8}/);
    expect(await readDoc(ws, 'plan.md')).toContain('{#'); // anchor written
  });

  it('allocates a union-wide id that cannot collide with an anchor-only id in another doc', async () => {
    ws = await makeRepo();
    // t9 is anchored in design.md but has NO store directory.
    await writeDoc(ws, 'design.md', '# Design\n\nan :mark[old anchor]{#t9} with no store.\n');
    await writeDoc(ws, 'plan.md', '# Plan\n\na fresh commentable span here.\n');
    await commit(ws, 'seed');
    const r = await runDl(ws, ['comment', 'fresh commentable span', '--doc', 'plan.md'], 'note');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('t10'); // >= t10, never reuses t9
  });

  it('--block with a stale ref is refused', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', '# Design\n\nrepeat me and repeat me again here.\n');
    await commit(ws, 'seed');
    const staleRef = refOf('# Design\n\nsomething else entirely\n');
    const r = await runDl(ws, ['comment', 'repeat me', '--block', `design.md@${staleRef}:2`], 'note');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/re-read|stale/i);
  });

  it('--block with a fresh ref disambiguates a span appearing twice in the doc but once in that block', async () => {
    ws = await makeRepo();
    const doc = '# Design\n\nfirst mention of repeat me here.\n\nsecond mention of repeat me there.\n';
    await writeDoc(ws, 'design.md', doc);
    await commit(ws, 'seed');
    // Block 2 is the first paragraph — "repeat me" is unique within it.
    const r = await runDl(ws, ['comment', 'repeat me', '--block', `design.md@${refOf(doc)}:2`], 'note');
    expect(r.code).toBe(0);
    const after = await readDoc(ws, 'design.md');
    // The FIRST occurrence (block 2) got the anchor; the second stayed plain.
    const anchored = after.indexOf(':mark[repeat me]{#');
    expect(anchored).toBeGreaterThan(-1);
    expect(anchored).toBeLessThan(after.indexOf('second mention'));
    expect(after.match(/:mark\[repeat me\]/g)).toHaveLength(1);
  });
});

describe('dl resolve (C3)', () => {
  it('unwraps the anchor (visible text preserved), retains the dir with a resolved.md marker, journals the note', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'plan.md', '# Plan\n\nA :mark[flagged text]{#t1} here.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');

    const r = await runDl(ws, ['resolve', 't1', '--note', 'conceded and folded']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/t1 resolved \(plan\.md@[0-9a-f]{8}\)/);

    const doc = await readDoc(ws, 'plan.md');
    expect(doc).toContain('flagged text'); // span preserved as plain text
    expect(doc).not.toContain('{#t1}'); // anchor gone
    expect(extractAnchors(doc)).toEqual([]);

    // Dir retained with a resolved marker authored by the model side ("claude").
    expect(await exists(join(ws, 'threads', 't1', 'resolved.md'))).toBe(true);
    const t = await listThreads(join(ws, 'threads'));
    expect(t[0].resolved!.author).toBe('claude');
    expect(t[0].resolved!.note).toBe('conceded and folded');

    // Note carried in the journal for the eventual turn record.
    const scratch = readScratch(ws);
    expect(scratch!.threads.resolved).toContainEqual({ id: 't1', note: 'conceded and folded' });
  });

  it('resolves an ORPHANED thread (no live anchor anywhere): skips the unwrap, writes the marker, reports "no live anchor"', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', '# Design\n\nno anchors here.\n');
    await writeComment(ws, 't9', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'orphan comment' });
    await commit(ws, 'seed');

    const r = await runDl(ws, ['resolve', 't9', '--note', 'closing the orphan']);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('t9 resolved (no live anchor)');

    expect(await exists(join(ws, 'threads', 't9', 'resolved.md'))).toBe(true);
    const t = await listThreads(join(ws, 'threads'));
    expect(t.find((x) => x.id === 't9')!.resolved!.note).toBe('closing the orphan');

    const scratch = readScratch(ws);
    expect(scratch!.threads.resolved).toContainEqual({ id: 't9', note: 'closing the orphan' });
  });
});

describe('nested docs (path-qualified ids) through the thread verbs', () => {
  it('comment → reply → resolve on a nested doc: the store is written and ownership carries the full path throughout', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', '# Doc\n\nnothing to see here.\n');
    await writeDoc(ws, 'nodes/16/design.md', '# Design\n\na commentable phrase here.\n');
    await commit(ws, 'seed');

    // comment: anchors the span in the nested doc, opens the thread in the
    // top-level threads/ store, and reports the path-qualified doc id.
    const c = await runDl(ws, ['comment', 'commentable phrase', '--doc', 'nodes/16/design.md'], 'why?');
    expect(c.code).toBe(0);
    expect(c.stdout).toMatch(/t1\s*(?:→|->)\s*nodes\/16\/design\.md@[0-9a-f]{8}/);
    expect(await readDoc(ws, 'nodes/16/design.md')).toContain(':mark[commentable phrase]{#t1}');
    expect(await exists(join(ws, 'threads', 't1', '0001.md'))).toBe(true);
    // The journal keys the doc write by its full path (thread ownership for
    // the foreign-edit guard and the eventual turn record).
    const afterComment = readScratch(ws);
    expect(Object.keys(afterComment!.writes)).toContain('nodes/16/design.md');
    expect(Object.keys(afterComment!.writes)).toContain('threads/t1/0001.md');

    // reply: doc inferred from the anchor — names the nested path.
    const r = await runDl(ws, ['reply', 't1'], 'a reply');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('nodes/16/design.md');
    const t = await listThreads(join(ws, 'threads'));
    expect(t.find((x) => x.id === 't1')!.comments.map((x) => x.body)).toEqual(['why?', 'a reply']);

    // resolve: unwraps the anchor in the nested doc, marks the thread in place.
    const res = await runDl(ws, ['resolve', 't1', '--note', 'done']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/t1 resolved \(nodes\/16\/design\.md@[0-9a-f]{8}\)/);
    expect(await readDoc(ws, 'nodes/16/design.md')).not.toContain('{#t1}');
    expect(await exists(join(ws, 'threads', 't1', 'resolved.md'))).toBe(true);
  }, 20000);

  it('comment refuses a non-doc path (threads/, archive/, traversal), writing nothing', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', '# Doc\n\na commentable phrase here.\n');
    await commit(ws, 'seed');

    for (const doc of ['threads/t1/0001.md', 'archive/x.md', '../evil.md']) {
      const r = await runDl(ws, ['comment', 'commentable phrase', '--doc', doc], 'x');
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/not a reviewable doc path/);
    }
    expect(await listThreads(join(ws, 'threads'))).toEqual([]);
  }, 20000);
});

describe('verbs keep docs canonical + journalled (C3)', () => {
  it('after a comment, the modified doc is canonical and the journal records its new hash', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'plan.md', '# Plan\n\na commentable phrase here.\n');
    await commit(ws, 'seed');
    const r = await runDl(ws, ['comment', 'commentable phrase', '--doc', 'plan.md'], 'note');
    expect(r.code).toBe(0);
    const doc = await readDoc(ws, 'plan.md');
    expect(await canonicalize(doc)).toBe(doc); // still canonical after anchor wrap
    // A4 says the journal stores a full sha256 of the exact bytes; refOf is the
    // 8-char prefix of that same sha256, so the stored hash must start with it.
    const scratch = readScratch(ws);
    expect(scratch!.writes['plan.md'].startsWith(refOf(doc))).toBe(true);
  });
});
