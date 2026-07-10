import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { checkWorkspace } from '../../scripts/dl/checkcore';
import { canonicalize } from '../../scripts/dl/canonical';
import {
  makeRepo,
  writeDoc,
  writeComment,
  writeResolvedMarker,
  commit,
  cleanup,
  readFixture,
  runDl,
} from './helpers';

// Package C1 — union-aware workspace lint.
//
// ASSUMED SIGNATURE (flagged in COVERAGE.md): checkWorkspace(ws) resolves to an
// array of { level: 'ERROR' | 'WARN'; message: string; doc?: string }. The plan
// fixes the rule set and exit behaviour but not the function name.

let ws: string;
afterEach(async () => {
  if (ws) await cleanup(ws);
});

/** Write an already-canonical doc so rule 6 (non-canonical) cannot false-fire. */
async function writeCanon(name: string, md: string): Promise<void> {
  await writeDoc(ws, name, await canonicalize(md));
}

function errors(issues: Array<{ level: string; message: string }>) {
  return issues.filter((i) => i.level === 'ERROR');
}
function anyMsg(issues: Array<{ level: string; message: string }>, re: RegExp): boolean {
  return issues.some((i) => re.test(i.message));
}

describe('checkWorkspace — rule 1: duplicate anchor id across docs (C1)', () => {
  it('positive: the same id anchored in two docs is an ERROR', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'Text :mark[a span]{#t1} here.\n');
    await writeCanon('plan.md', 'Text :mark[another]{#t1} here.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    expect(anyMsg(errors(await checkWorkspace(ws)), /duplicat|>1 doc|two docs|more than one/i)).toBe(true);
  });
});

describe('checkWorkspace — rule 2: anchor with no thread (C1)', () => {
  it('positive: an anchor with no thread directory is an ERROR', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'Text :mark[a span]{#t1} here.\n');
    await commit(ws, 'seed');
    expect(anyMsg(await checkWorkspace(ws), /no thread/i)).toBe(true);
  });

  it('negative: an anchor with a populated thread is clean', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'Text :mark[a span]{#t1} here.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    expect(errors(await checkWorkspace(ws))).toEqual([]);
  });
});

describe('checkWorkspace — rule 3: orphaned thread, union-aware (C1)', () => {
  it('positive: a thread with no live anchor anywhere and no resolved marker is an ERROR', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'No anchors here.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'orphan' });
    await commit(ws, 'seed');
    expect(anyMsg(errors(await checkWorkspace(ws)), /orphan/i)).toBe(true);
  });

  it('regression (2026-07-09 multi-doc blindness): an anchor in plan.md with a thread is clean', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'Design prose, no anchors.\n');
    await writeCanon('plan.md', 'Plan text :mark[the floor pass]{#t3} here.\n');
    await writeComment(ws, 't3', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    // Union scope: the anchor lives in a DIFFERENT doc than the first — must be clean.
    expect(errors(await checkWorkspace(ws))).toEqual([]);
  });

  it('rule 3b positive: a resolved marker present while the anchor is still live is an ERROR', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'Text :mark[still live]{#t1} here.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await writeResolvedMarker(ws, 't1', { author: 'rjs', created: '2026-07-02T09:00:00.000Z', note: 'oops' });
    await commit(ws, 'seed');
    expect(anyMsg(errors(await checkWorkspace(ws)), /resolved.*still|still.*anchor|marker.*live/i)).toBe(true);
  });

  it('rule 3 negative: a resolved thread with no anchor is clean', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'No anchors here.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await writeResolvedMarker(ws, 't1', { author: 'rjs', created: '2026-07-02T09:00:00.000Z', note: 'done' });
    await commit(ws, 'seed');
    expect(errors(await checkWorkspace(ws))).toEqual([]);
  });
});

describe('checkWorkspace — rule 4: malformed comment frontmatter (C1)', () => {
  it('positive: a comment with no author is an ERROR', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'Text :mark[a span]{#t1} here.\n');
    await mkdir(join(ws, 'threads', 't1'), { recursive: true });
    await writeFile(join(ws, 'threads', 't1', '0001.md'), '---\ncreated: not-a-date\n---\nbody\n', 'utf8');
    await commit(ws, 'seed');
    expect(anyMsg(errors(await checkWorkspace(ws)), /malformed/i)).toBe(true);
  });
});

describe('checkWorkspace — rule 5: non-t<N> id (WARN) (C1)', () => {
  it('positive: a {#foo} anchor is a WARNING, not an error', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'Text :mark[a span]{#foo} here.\n');
    await writeComment(ws, 'foo', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    const issues = await checkWorkspace(ws);
    expect(issues.some((i) => i.level === 'WARN' && /non-standard|t<N>|non-`?t/i.test(i.message))).toBe(true);
  });
});

describe('checkWorkspace — rule 6: non-canonical doc (C1)', () => {
  it('positive: a non-canonical doc is an ERROR that names the doc', async () => {
    ws = await makeRepo();
    // Deliberately NOT canonicalised: extra heading space / sloppy list.
    await writeDoc(ws, 'design.md', '#   Sloppy Heading\n\n*    loose    bullet\n');
    await commit(ws, 'seed');
    const errs = errors(await checkWorkspace(ws));
    expect(anyMsg(errs, /canonical/i)).toBe(true);
    expect(errs.some((i) => (i as { doc?: string }).doc === 'design.md' || /design\.md/.test(i.message))).toBe(true);
  });
});

describe('checkWorkspace — rule 7: empty / mid-word split anchors (C1)', () => {
  it('positive: an empty-span anchor is an ERROR', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', 'An empty :mark[]{#t1} anchor.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    expect(anyMsg(errors(await checkWorkspace(ws)), /empty/i)).toBe(true);
  });

  it('positive: an inline anchor split mid-word is an ERROR (t21/t25 class)', async () => {
    ws = await makeRepo();
    // "foo" + anchored "bar" + "baz": the span starts and ends inside a word run.
    await writeDoc(ws, 'design.md', 'A foo:mark[bar]{#t1}baz word.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    expect(anyMsg(errors(await checkWorkspace(ws)), /mid-word|split|fragment/i)).toBe(true);
  });

  it('positive: a real mid-word split is still an ERROR even with word chars elsewhere in the doc', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', 'Words around foo:mark[bar]{#t1}baz stay plain.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    expect(anyMsg(errors(await checkWorkspace(ws)), /mid-word|split|fragment/i)).toBe(true);
  });

  it('negative: a span whose own edge is punctuation is clean, even though the OUTER character is a word char (false-positive regression)', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'word:mark[, punctuated]{#t1} end.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    expect(errors(await checkWorkspace(ws))).toEqual([]);
  });
});

describe('checkWorkspace — rule 8: over-fragmented anchor (WARN) (C1)', () => {
  it('positive: the same id in >3 separate :mark fragments is a WARNING', async () => {
    ws = await makeRepo();
    await writeDoc(
      ws,
      'design.md',
      'X :mark[a]{#t1} :mark[b]{#t1} :mark[c]{#t1} :mark[d]{#t1} end.\n',
    );
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    expect(await checkWorkspace(ws)).toEqual(
      expect.arrayContaining([expect.objectContaining({ level: 'WARN' })]),
    );
  });
});

describe('checkWorkspace — rule 9: Milkdown-divergent constructs (C1)', () => {
  it('the lint-forbidden fixture trips 9a (nested emphasis), 9b (fmt in span), 9c (bare :mark), 9d (<br>)', async () => {
    ws = await makeRepo();
    await writeDoc(ws, 'design.md', await readFixture('lint-forbidden.md'));
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    const errs = errors(await checkWorkspace(ws));
    expect(anyMsg(errs, /nested|emphasis|strong/i)).toBe(true); // 9a
    expect(anyMsg(errs, /inside|format|span/i)).toBe(true); // 9b
    expect(anyMsg(errs, /bare|:mark|backtick/i)).toBe(true); // 9c
    expect(anyMsg(errs, /<br|hard break|line break/i)).toBe(true); // 9d
  });

  it('negative: a `:mark` in backticks is clean', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'Write the anchor literal as `:mark` in prose.\n');
    await commit(ws, 'seed');
    expect(errors(await checkWorkspace(ws))).toEqual([]);
  });

  it('negative: emphasis ADJACENT to (not inside) an anchor is clean', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'An *emphasised* word by :mark[a plain span]{#t1} here.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    expect(errors(await checkWorkspace(ws))).toEqual([]);
  });
});

describe('checkWorkspace — exit-code shape via issue levels (C1)', () => {
  it('a clean workspace produces zero issues', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'Text :mark[a span]{#t1} here.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    expect(await checkWorkspace(ws)).toEqual([]);
  });

  it('warnings-only workspace has no ERROR-level issues (would exit 0)', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'Text :mark[a span]{#foo} here.\n');
    await writeComment(ws, 'foo', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    const issues = await checkWorkspace(ws);
    expect(issues.some((i) => i.level === 'WARN')).toBe(true);
    expect(errors(issues)).toEqual([]);
  });
});

describe('dl check — CLI output shape and exit codes (C1)', () => {
  it('clean workspace → exit 0, summary line "check: clean"', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'Text :mark[a span]{#t1} here.\n');
    await writeComment(ws, 't1', 1, { author: 'rjs', created: '2026-07-01T09:00:00.000Z', body: 'q' });
    await commit(ws, 'seed');
    const r = await runDl(ws, ['check']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('check: clean');
  });

  it('errors → exit 1, one ERROR line per issue naming the doc, then the summary line last', async () => {
    ws = await makeRepo();
    await writeCanon('design.md', 'Text :mark[a span]{#t1} here.\n'); // t1 has no thread dir
    await commit(ws, 'seed');
    const r = await runDl(ws, ['check']);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/^ERROR /m);
    const lines = r.stdout.trim().split('\n');
    expect(lines[lines.length - 1]).toMatch(/^check: \d+ errors?(, \d+ warnings?)?/);
  });
});
