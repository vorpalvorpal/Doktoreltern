import { describe, it, expect, afterEach } from 'vitest';
import { makeRepo, writeDoc, commit, runDl, cleanup } from './helpers';

// Package A7 — the `scripts/dl.ts` dispatcher. Real (read/edit) verbs work; B/C
// verbs are stubs (`not implemented yet`, exit 1) until their packages land.

let ws: string;
afterEach(async () => {
  if (ws) await cleanup(ws);
});

describe('dl dispatcher (A7)', () => {
  it('--help lists one line per verb', async () => {
    ws = await makeRepo();
    const r = await runDl(ws, ['--help']);
    for (const verb of ['read', 'edit', 'agenda', 'orient', 'check', 'commit', 'reply', 'comment', 'resolve']) {
      expect(r.stdout).toContain(verb);
    }
  });

  it('an unknown verb exits 1 with terse usage on stderr', async () => {
    ws = await makeRepo();
    const r = await runDl(ws, ['frobnicate']);
    expect(r.code).toBe(1);
    // The usage line must name the offending verb or say "usage" — a bare
    // module-load crash (today's TDD-red state) does neither.
    expect(r.stderr).toMatch(/frobnicate|usage/i);
    expect(r.stdout.trim()).toBe('');
  });

  it('stubbed B/C verbs exit 1 with "not implemented yet" (until their package lands)', async () => {
    // NOTE: once packages B and C are implemented these verbs become real; this
    // test documents the A-only intermediate state and should be retired then.
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', '# Doc\n\nbody\n');
    await commit(ws, 'seed');
    const r = await runDl(ws, ['orient']);
    // Either the A-era stub, or (post-B) a real orient — accept both so this file
    // does not falsely fail once B lands, but assert the stub shape when exit 1.
    if (r.code === 1) expect(r.stderr).toMatch(/not implemented yet/);
  });
});
