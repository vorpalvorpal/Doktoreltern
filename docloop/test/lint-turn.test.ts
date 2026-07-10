import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintTurn, type LintPaths } from '../scripts/lint-turn-core';
import { addComment } from '../src/threads-store';

let dir: string;
let paths: LintPaths;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'docloop-lint-turn-'));
  paths = { docPath: join(dir, 'doc.md'), threadsDir: join(dir, 'threads') };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeDoc(markdown: string): Promise<void> {
  await writeFile(paths.docPath, markdown, 'utf8');
}

describe('lintTurn', () => {
  it('is clean when every anchor has a thread dir and every thread has a live anchor', async () => {
    await writeDoc('A :mark[span]{#t1} here.\n');
    await addComment(paths.threadsDir, 't1', {
      author: 'rjs',
      body: 'hi',
      created: '2026-06-29T10:00:00.000Z',
    });
    expect(await lintTurn(paths)).toEqual([]);
  });

  it('errors when an anchor has no thread directory', async () => {
    await writeDoc('A :mark[span]{#t1} here.\n');
    await mkdir(paths.threadsDir, { recursive: true });
    const issues = await lintTurn(paths);
    expect(issues).toContainEqual({ level: 'ERROR', message: 'anchor #t1 has no thread directory' });
  });

  it('errors when a thread has no comments (empty directory)', async () => {
    await writeDoc('A :mark[span]{#t1} here.\n');
    await mkdir(join(paths.threadsDir, 't1'), { recursive: true });
    const issues = await lintTurn(paths);
    expect(issues).toContainEqual({ level: 'ERROR', message: 'anchor #t1 has no thread directory' });
  });

  // C0 (spec decision 9): the orphan rule now reads "no live anchor AND no
  // resolved.md marker" (resolving no longer deletes the directory).
  it('errors when a thread directory is orphaned (no matching anchor, no resolved marker)', async () => {
    await writeDoc('No anchors here.\n');
    await addComment(paths.threadsDir, 't1', { author: 'rjs', body: 'hi' });
    const issues = await lintTurn(paths);
    expect(issues).toContainEqual({
      level: 'ERROR',
      message: 'thread t1/ is orphaned (no live anchor and no resolved marker)',
    });
  });

  it('errors on malformed frontmatter (missing author / unparseable created)', async () => {
    await writeDoc('A :mark[span]{#t1} here.\n');
    await mkdir(join(paths.threadsDir, 't1'), { recursive: true });
    await writeFile(join(paths.threadsDir, 't1', '0001.md'), 'no frontmatter here, just text', 'utf8');
    const issues = await lintTurn(paths);
    expect(issues).toContainEqual({ level: 'ERROR', message: 't1/0001.md has malformed frontmatter' });
  });

  it('warns (but does not error) on a non-t<N>-shaped anchor id', async () => {
    await writeDoc('A :mark[span]{#draft} here.\n');
    await addComment(paths.threadsDir, 'draft', { author: 'rjs', body: 'hi' });
    const issues = await lintTurn(paths);
    expect(issues).toEqual([{ level: 'WARN', message: 'anchor #draft has a non-standard id (expected t<N>)' }]);
  });

  it('reports every issue found, not just the first', async () => {
    await writeDoc('A :mark[a]{#t1} and :mark[b]{#t2}.\n');
    // t1: no thread dir at all. t2: exists but no comments. t3: orphaned.
    await mkdir(join(paths.threadsDir, 't2'), { recursive: true });
    await addComment(paths.threadsDir, 't3', { author: 'rjs', body: 'x' });

    const issues = await lintTurn(paths);
    expect(issues).toContainEqual({ level: 'ERROR', message: 'anchor #t1 has no thread directory' });
    expect(issues).toContainEqual({ level: 'ERROR', message: 'anchor #t2 has no thread directory' });
    expect(issues).toContainEqual({
      level: 'ERROR',
      message: 'thread t3/ is orphaned (no live anchor and no resolved marker)',
    });
    expect(issues).toHaveLength(3);
  });
});
