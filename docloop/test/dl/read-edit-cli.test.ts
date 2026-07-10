import { describe, it, expect, afterEach } from 'vitest';
import { splitBlocks } from '../../scripts/dl/blocks';
import { refOf } from '../../scripts/dl/refs';
import { canonicalize } from '../../scripts/dl/canonical';
import { makeRepo, writeDoc, readDoc, writeComment, commit, runDl, cleanup, readFixture } from './helpers';

// Packages A5 / A6 (integration) — `dl read` and `dl edit` through the real CLI
// (execFile + vite-node), pattern of test/thread-cli.test.ts. These lean on the
// DOCLOOP_WORKSPACE override (see helpers.runDl / COVERAGE.md).

let ws: string;
afterEach(async () => {
  if (ws) await cleanup(ws);
});

const CANON = '# Doc\n\npara one\n\npara two\n\npara three\n\npara four\n';

describe('dl read (A5)', () => {
  it('header ref equals refOf(bytes) and marker count equals splitBlocks length', async () => {
    ws = await makeRepo();
    const bytes = await readFixture('design.md');
    await writeDoc(ws, 'design.md', bytes);
    await commit(ws, 'seed');

    const r = await runDl(ws, ['read', 'design.md']);
    expect(r.code).toBe(0);

    const firstLine = r.stdout.split('\n')[0];
    expect(firstLine).toMatch(new RegExp(`^design\\.md@${refOf(bytes)} blocks 1-\\d+$`));

    const markers = r.stdout.match(/^@@ \d+ @@$/gm) ?? [];
    expect(markers).toHaveLength(splitBlocks(bytes).length);
  });

  it('stripping markers and re-adding the separators reconstructs the doc exactly', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'seed');
    const r = await runDl(ws, ['read', 'doc.md']);

    // Parse the output back into (ordinal → printed body) and check each body is
    // its block's segment minus the trailing blank-line separator; re-adding the
    // separators must therefore reconstruct the doc byte-exactly.
    const lines = r.stdout.split('\n');
    const bodies = new Map<number, string>();
    let current: number | null = null;
    let buf: string[] = [];
    const flush = () => {
      if (current !== null) bodies.set(current, buf.join('\n'));
      buf = [];
    };
    for (const line of lines.slice(1)) {
      const m = /^@@ (\d+) @@$/.exec(line);
      if (m) {
        flush();
        current = Number(m[1]);
      } else if (current !== null) {
        buf.push(line);
      }
    }
    flush();

    let reconstructed = '';
    for (const b of splitBlocks(CANON)) {
      const body = bodies.get(b.n);
      expect(body, `block ${b.n} missing from output`).toBeDefined();
      const separator = b.segment.slice(b.segment.replace(/\n+$/, '').length);
      expect(body!.replace(/\n+$/, '')).toBe(b.segment.replace(/\n+$/, ''));
      reconstructed += body!.replace(/\n+$/, '') + separator;
    }
    expect(reconstructed).toBe(CANON);
  });

  it('a section read shows the sub-range with TRUE global ordinals (not renumbered from 1)', async () => {
    ws = await makeRepo();
    const bytes = await readFixture('design.md');
    await writeDoc(ws, 'design.md', bytes);
    await commit(ws, 'seed');

    const r = await runDl(ws, ['read', 'design.md', 'What it is']);
    expect(r.code).toBe(0);
    // "What it is" is not the first heading, so the sub-range starts above 1.
    const m = r.stdout.match(/blocks (\d+)-(\d+)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThan(1);
    // ...and the ref shown is still the whole-doc ref.
    expect(r.stdout.split('\n')[0]).toContain(`@${refOf(bytes)}`);
  });

  it('unknown doc → exit 1 listing tracked docs, nothing on stdout', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'seed');
    const r = await runDl(ws, ['read', 'nope.md']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('doc.md'); // error lists the tracked docs (A5)
    expect(r.stdout.trim()).toBe('');
  });
});

describe('dl edit (A6)', () => {
  it('replaces a middle block, returns the new ref, leaves the file canonical', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'seed');

    const r = await runDl(ws, ['edit', `doc.md@${refOf(CANON)}`], '@@ replace 3\nREPLACED two\n');
    expect(r.code).toBe(0);

    const after = await readDoc(ws, 'doc.md');
    expect(after).toContain('REPLACED two');
    expect(after).not.toContain('para two');
    expect(await canonicalize(after)).toBe(after); // file stays canonical
    // Success line carries the NEW ref.
    expect(r.stdout).toContain(`doc.md@${refOf(after)}`);
  });

  it('an equal-block-count replace reports shift: none', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'seed');
    const r = await runDl(ws, ['edit', `doc.md@${refOf(CANON)}`], '@@ replace 3\njust one block\n');
    expect(r.stdout).toMatch(/shift:\s*none/);
  });

  it('a delete reports a signed shift', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'seed');
    const r = await runDl(ws, ['edit', `doc.md@${refOf(CANON)}`], '@@ delete 3\n');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/shift:.*-1/);
  });

  it('overlapping ops → error, file byte-identical to before', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'seed');
    const before = await readDoc(ws, 'doc.md');
    const r = await runDl(ws, ['edit', `doc.md@${refOf(CANON)}`], '@@ replace 3-4\nx\n\n@@ delete 3\n');
    expect(r.code).toBe(1);
    expect(await readDoc(ws, 'doc.md')).toBe(before);
  });

  it('stale ref → error naming the current ref, no write', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'seed');
    const before = await readDoc(ws, 'doc.md');
    const staleRef = refOf('# Doc\n\nsomething the model read earlier\n');
    const r = await runDl(ws, ['edit', `doc.md@${staleRef}`], '@@ replace 2\nx\n');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(refOf(before)); // current ref surfaced
    expect(await readDoc(ws, 'doc.md')).toBe(before);
  });

  it('a replacement body carrying an existing inline anchor survives canonicalisation', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'seed');
    const r = await runDl(
      ws,
      ['edit', `doc.md@${refOf(CANON)}`],
      '@@ replace 3\npara two with :mark[a span]{#t3} kept\n',
    );
    expect(r.code).toBe(0);
    expect(await readDoc(ws, 'doc.md')).toContain(':mark[a span]{#t3}');
  });

  it('a sloppy-formatted body lands in canonical form', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'seed');
    await runDl(ws, ['edit', `doc.md@${refOf(CANON)}`], '@@ replace 3\n*   sloppy    emphasis   spacing*\n');
    const after = await readDoc(ws, 'doc.md');
    expect(await canonicalize(after)).toBe(after);
  });

  it('delete 1-N empties the doc to zero blocks', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'seed');
    const n = splitBlocks(CANON).length;
    const r = await runDl(ws, ['edit', `doc.md@${refOf(CANON)}`], `@@ delete 1-${n}\n`);
    expect(r.code).toBe(0);
    const after = await readDoc(ws, 'doc.md');
    expect(splitBlocks(after).length).toBe(0);
  });

  it('a body line matching the op-header grammar is a hard error even with real content on both sides, file untouched', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'doc.md', CANON);
    await commit(ws, 'seed');
    const before = await readDoc(ws, 'doc.md');
    const r = await runDl(
      ws,
      ['edit', `doc.md@${refOf(CANON)}`],
      '@@ replace 2\nreal content\n@@ replace 3\nmore content\n',
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/ambiguous body/i);
    expect(await readDoc(ws, 'doc.md')).toBe(before);
  });
});

describe('dl edit — post-edit anchor-consistency warn (A6 warn mode)', () => {
  it('editing away an anchored span still succeeds (exit 0) but warns the thread is now unanchored', async () => {
    ws = await makeRepo();
    const doc = '# Doc\n\npara one\n\nA :mark[flagged bit]{#t1} note.\n';
    await writeDoc(ws, 'doc.md', doc);
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');

    const r = await runDl(ws, ['edit', `doc.md@${refOf(doc)}`], '@@ replace 3\nplain text, no anchor\n');
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/warn: thread t1 unanchored \(resolve or re-anchor\)/);
  });
});
