import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newThread, replyThread, resolveThreadCmd, type ThreadPaths } from '../scripts/thread-actions';
import { listThreads, addComment } from '../src/threads-store';
import { extractAnchors } from '../src/threads';

// Exercises the deterministic anchor/comment tool (scripts/thread-actions.ts)
// against a scratch workspace, mirroring the shape of the real docloop/workspace/
// directory (doc.md + threads/), but isolated per test.

let dir: string;
let paths: ThreadPaths;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'docloop-thread-cli-'));
  paths = { docPath: join(dir, 'doc.md'), threadsDir: join(dir, 'threads') };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeDoc(markdown: string): Promise<void> {
  await writeFile(paths.docPath, markdown, 'utf8');
}

describe('newThread', () => {
  it('anchors a unique span, allocates the next id, and creates the first comment', async () => {
    await writeDoc('# Notes\n\nThe quick brown fox jumps.\n');

    const id = await newThread(paths, 'quick brown', 'C', 'why this phrasing?');
    expect(id).toBe('t1');

    const doc = await readFile(paths.docPath, 'utf8');
    expect(doc).toContain(':mark[quick brown]{#t1}');

    const threads = await listThreads(paths.threadsDir);
    expect(threads).toHaveLength(1);
    expect(threads[0].id).toBe('t1');
    expect(threads[0].comments[0]).toMatchObject({ author: 'C', body: 'why this phrasing?' });
  });

  it('allocates the next id above the max of BOTH doc anchors and thread directories', async () => {
    await writeDoc('A :mark[span]{#t5} here, and another unique word.\n');
    // A stray threads/t9 directory with no live anchor (e.g. left over from a
    // resolve that didn't clean up) must still count toward the max, so the
    // freshly allocated id can never collide with it.
    await addComment(paths.threadsDir, 't9', { author: 'rjs', body: 'orphaned' });

    const id = await newThread(paths, 'unique word', 'C', 'seed');
    expect(id).toBe('t10');
  });

  it('rejects a needle with zero matches, writing nothing', async () => {
    await writeDoc('# Notes\n\nHello world.\n');
    await expect(newThread(paths, 'not present anywhere', 'C', 'x')).rejects.toThrow(/not found/);
    expect(await listThreads(paths.threadsDir)).toEqual([]);
  });

  it('rejects an ambiguous needle (multiple matches), writing nothing', async () => {
    await writeDoc('# Notes\n\nthe word word appears twice: word.\n');
    await expect(newThread(paths, 'word', 'C', 'x')).rejects.toThrow(/ambiguous/);
    const doc = await readFile(paths.docPath, 'utf8');
    expect(doc).not.toContain(':mark[');
    expect(await listThreads(paths.threadsDir)).toEqual([]);
  });
});

describe('replyThread', () => {
  it('appends a reply with the next sequence number to a live anchor', async () => {
    await writeDoc('A :mark[span]{#t1} here.\n');
    await replyThread(paths, 't1', 'rjs', 'first');
    const comment = await replyThread(paths, 't1', 'C', 'second');
    expect(comment.seq).toBe(2);

    const threads = await listThreads(paths.threadsDir);
    expect(threads[0].comments.map((c) => c.body)).toEqual(['first', 'second']);
  });

  it('rejects a reply to an id with no live anchor in doc.md', async () => {
    await writeDoc('No anchors here.\n');
    await expect(replyThread(paths, 't1', 'C', 'x')).rejects.toThrow(/no live anchor/);
  });
});

describe('resolveThreadCmd', () => {
  it('unwraps the anchor to plain text and deletes the thread directory', async () => {
    await writeDoc('A :mark[flagged text]{#t1} here.\n');
    await replyThread(paths, 't1', 'rjs', 'note');

    await resolveThreadCmd(paths, 't1');

    const doc = await readFile(paths.docPath, 'utf8');
    expect(doc).not.toContain('{#t1}');
    expect(doc).toContain('flagged text');
    expect(extractAnchors(doc)).toEqual([]);
    expect(await listThreads(paths.threadsDir)).toEqual([]);
  });
});
