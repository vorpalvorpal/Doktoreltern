import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  newThreadId,
  listThreads,
  readThread,
  addComment,
  resolveThread,
} from '../src/threads-store';

// A fresh temp directory per test keeps the filesystem state isolated; we use it
// as the store's baseDir and remove it afterwards. Tests never touch the repo.
let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'docloop-store-'));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('newThreadId', () => {
  it('starts at t1 when there are no existing ids', () => {
    expect(newThreadId([])).toBe('t1');
  });

  it('returns max numeric suffix + 1, ignoring t10 vs t2 lexical ordering', () => {
    expect(newThreadId(['t1', 't2', 't10'])).toBe('t11');
  });

  it('ignores ids that do not match t<N>', () => {
    expect(newThreadId(['t3', 'draft', 'notes'])).toBe('t4');
  });
});

describe('addComment', () => {
  it('creates t1/0001.md with correct frontmatter and body', async () => {
    const c = await addComment(base, 't1', {
      author: 'rjs',
      body: 'first note',
      created: '2026-06-29T10:00:00.000Z',
    });
    expect(c).toEqual({
      seq: 1,
      author: 'rjs',
      created: '2026-06-29T10:00:00.000Z',
      body: 'first note',
    });

    const text = await readFile(join(base, 't1', '0001.md'), 'utf8');
    expect(text).toBe(
      '---\nauthor: rjs\ncreated: 2026-06-29T10:00:00.000Z\n---\nfirst note',
    );
  });

  it('increments the sequence on a second comment to the same thread', async () => {
    await addComment(base, 't1', { author: 'rjs', body: 'one' });
    const second = await addComment(base, 't1', { author: 'C', body: 'two' });
    expect(second.seq).toBe(2);

    // The second comment lands in 0002.md, not overwriting 0001.md.
    const text = await readFile(join(base, 't1', '0002.md'), 'utf8');
    expect(text).toContain('author: C');
    expect(text).toContain('two');
  });

  it('defaults created to an ISO timestamp when omitted', async () => {
    const c = await addComment(base, 't1', { author: 'rjs', body: 'no date' });
    // Round-trips as a valid ISO instant.
    expect(new Date(c.created).toISOString()).toBe(c.created);
  });
});

describe('listThreads', () => {
  it('returns [] when baseDir does not exist', async () => {
    const missing = join(base, 'nope');
    expect(await listThreads(missing)).toEqual([]);
  });

  it('sorts threads by numeric id (t2 before t10) with comments by seq', async () => {
    // Insert out of order to prove the sort isn't just insertion order.
    await addComment(base, 't10', { author: 'rjs', body: 'ten' });
    await addComment(base, 't2', { author: 'rjs', body: 'two-a' });
    await addComment(base, 't2', { author: 'rjs', body: 'two-b' });

    const threads = await listThreads(base);
    expect(threads.map((t) => t.id)).toEqual(['t2', 't10']);
    expect(threads[0].comments.map((c) => c.seq)).toEqual([1, 2]);
    expect(threads[0].comments.map((c) => c.body)).toEqual(['two-a', 'two-b']);
  });

  it('round-trips frontmatter and body exactly', async () => {
    await addComment(base, 't1', {
      author: 'rjs',
      body: 'plain body',
      created: '2026-06-29T12:34:56.000Z',
    });
    const [thread] = await listThreads(base);
    expect(thread.comments[0]).toEqual({
      seq: 1,
      author: 'rjs',
      created: '2026-06-29T12:34:56.000Z',
      body: 'plain body',
    });
  });

  it('ignores stray non-NNNN.md files in a thread directory', async () => {
    await addComment(base, 't1', { author: 'rjs', body: 'real' });
    // Drop a junk file alongside the comment; it must not become a comment.
    await writeFile(join(base, 't1', 'notes.txt'), 'ignore me', 'utf8');

    const [thread] = await listThreads(base);
    expect(thread.comments).toHaveLength(1);
    expect(thread.comments[0].body).toBe('real');
  });
});

describe('readThread', () => {
  it('returns null for a missing id', async () => {
    expect(await readThread(base, 't404')).toBeNull();
  });

  it('reads an existing thread by id', async () => {
    await addComment(base, 't1', { author: 'rjs', body: 'hi' });
    const thread = await readThread(base, 't1');
    expect(thread?.id).toBe('t1');
    expect(thread?.comments[0].body).toBe('hi');
  });
});

describe('resolveThread', () => {
  it('deletes the thread directory so listThreads omits it', async () => {
    await addComment(base, 't1', { author: 'rjs', body: 'a' });
    await addComment(base, 't2', { author: 'rjs', body: 'b' });

    await resolveThread(base, 't1');

    expect(await readThread(base, 't1')).toBeNull();
    expect((await listThreads(base)).map((t) => t.id)).toEqual(['t2']);
  });

  it('is a no-op when resolving a missing id', async () => {
    await expect(resolveThread(base, 't999')).resolves.toBeUndefined();
  });
});

describe('markdown fidelity (the whole point)', () => {
  it('round-trips a body with a fenced code block and a list intact', async () => {
    const body = [
      'Here is the problem:',
      '',
      '```ts',
      'const x: number = 1;',
      'if (x > 0) {',
      '  console.log("positive");',
      '}',
      '```',
      '',
      'Suggested fixes:',
      '',
      '- use a guard clause',
      '- add a test',
      '- document the edge case',
    ].join('\n');

    await addComment(base, 't1', { author: 'rjs', body, created: '2026-06-29T00:00:00.000Z' });
    const thread = await readThread(base, 't1');
    expect(thread?.comments[0].body).toBe(body);
  });
});
