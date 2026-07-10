import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { lintTurn } from '../../scripts/lint-turn-core';
import { addComment } from '../../src/threads-store';
import { makeDir, cleanup, writeResolvedMarker } from './helpers';

// Package C0 — the legacy single-doc lint (scripts/lint-turn-core.ts) taught the
// resolved-marker rules while it is still in transitional use. These assert the
// UPDATED behaviour; the existing lint-turn.test.ts pins the OLD "resolve should
// have deleted it" wording and will need reconciling (see COVERAGE.md).
//
// The resolved.md marker is seeded DIRECTLY on disk (not via resolveThread):
// under the pre-C0 store, resolveThread deletes the directory, which would make
// these tests pass vacuously against today's code. Seeding the marker keeps them
// genuinely red until lint-turn-core learns the marker rules.

let dir: string;
afterEach(async () => {
  if (dir) await cleanup(dir);
});

describe('lintTurn — resolved markers (C0)', () => {
  it('a resolved-marker dir with no live anchor is CLEAN (no orphan error)', async () => {
    dir = await makeDir();
    const docPath = join(dir, 'doc.md');
    const threadsDir = join(dir, 'threads');
    await writeFile(docPath, 'No anchors here.\n', 'utf8'); // anchor dropped on resolve
    await addComment(threadsDir, 't1', { author: 'rjs', body: 'x', created: '2026-07-01T09:00:00.000Z' });
    await writeResolvedMarker(dir, 't1', { author: 'rjs', created: '2026-07-02T09:00:00.000Z', note: 'done' });

    const issues = await lintTurn({ docPath, threadsDir });
    expect(issues.filter((i) => i.level === 'ERROR')).toEqual([]);
  });

  it('a resolved marker present while the anchor is still live is an ERROR', async () => {
    dir = await makeDir();
    const docPath = join(dir, 'doc.md');
    const threadsDir = join(dir, 'threads');
    await writeFile(docPath, 'A :mark[still here]{#t1} anchor.\n', 'utf8');
    await addComment(threadsDir, 't1', { author: 'rjs', body: 'x', created: '2026-07-01T09:00:00.000Z' });
    await writeResolvedMarker(dir, 't1', { author: 'rjs', created: '2026-07-02T09:00:00.000Z', note: 'done' });

    const issues = await lintTurn({ docPath, threadsDir });
    expect(issues.some((i) => i.level === 'ERROR')).toBe(true);
  });

  it('an UNMARKED dir with no live anchor is still an ERROR (unchanged orphan behaviour)', async () => {
    dir = await makeDir();
    const docPath = join(dir, 'doc.md');
    const threadsDir = join(dir, 'threads');
    await writeFile(docPath, 'No anchors here.\n', 'utf8');
    await mkdir(threadsDir, { recursive: true });
    await addComment(threadsDir, 't1', { author: 'rjs', body: 'orphan', created: '2026-07-01T09:00:00.000Z' });

    const issues = await lintTurn({ docPath, threadsDir });
    expect(issues.some((i) => i.level === 'ERROR')).toBe(true);
  });
});
