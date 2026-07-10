import { describe, it, expect, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { refOf, parseRef, assertFresh } from '../../scripts/dl/refs';
import { makeDir, cleanup } from './helpers';

// Package A2 — content-hash refs and the stale-ref guard.

describe('refOf (A2)', () => {
  it('is deterministic: equal bytes give equal refs', () => {
    expect(refOf('# Doc\n\nbody\n')).toBe(refOf('# Doc\n\nbody\n'));
  });

  it('is an 8-char lowercase hex prefix of sha-256', () => {
    expect(refOf('anything')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('a whitespace-only difference produces a different ref', () => {
    expect(refOf('a b\n')).not.toBe(refOf('a  b\n'));
    expect(refOf('body\n')).not.toBe(refOf('body\n\n'));
  });
});

describe('parseRef (A2)', () => {
  it('splits <doc>@<hash>', () => {
    expect(parseRef('design.md@a3f21c4e')).toEqual({ doc: 'design.md', hash: 'a3f21c4e' });
  });

  it('rejects a ref with no @', () => {
    expect(() => parseRef('design.md')).toThrow();
  });

  it('rejects an empty doc name', () => {
    expect(() => parseRef('@a3f21c4e')).toThrow();
  });

  it('rejects a non-hex hash', () => {
    expect(() => parseRef('design.md@zzzz')).toThrow();
  });
});

describe('assertFresh (A2)', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await cleanup(dir);
  });

  it('passes when the on-disk bytes still match the ref hash', async () => {
    dir = await makeDir();
    const path = join(dir, 'design.md');
    const bytes = '# Doc\n\nbody\n';
    await writeFile(path, bytes, 'utf8');
    await expect(assertFresh(path, refOf(bytes))).resolves.not.toThrow();
  });

  it('throws a stale-ref error naming the CURRENT ref so the model can re-read', async () => {
    dir = await makeDir();
    const path = join(dir, 'design.md');
    await writeFile(path, '# Doc\n\nold\n', 'utf8');
    const staleHash = refOf('# Doc\n\nwhat the model last read\n');
    await writeFile(path, '# Doc\n\nchanged on disk\n', 'utf8');
    const current = refOf('# Doc\n\nchanged on disk\n');
    await expect(assertFresh(path, staleHash)).rejects.toThrow(new RegExp(current));
  });
});
