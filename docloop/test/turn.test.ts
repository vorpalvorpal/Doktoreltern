import { describe, it, expect } from 'vitest';
import { renderTurn } from '../src/turn';
import type { Thread } from '../src/threads-store';
import { OLD_MD, NEW_MD } from '../src/sample';

// A store shaped like threads-store.ts `listThreads()` output, keyed to the
// sample's `#t1` anchor.
const STORE: Thread[] = [
  {
    id: 't1',
    comments: [
      { seq: 1, author: 'rjs', created: 'x', body: 't1 open.' },
      { seq: 2, author: 'rjs', created: 'x', body: 'source for the speed claim?' },
    ],
  },
];

describe('renderTurn (M3 LLM-facing turn render)', () => {
  it('emits a <turn> with threads before edits (open items first)', () => {
    const xml = renderTurn(OLD_MD, NEW_MD, STORE);
    expect(xml.startsWith('<turn>')).toBe(true);
    expect(xml.trimEnd().endsWith('</turn>')).toBe(true);
    expect(xml.indexOf('<threads')).toBeLessThan(xml.indexOf('<edits'));
  });

  it('renders the body diff as <ins>/<del>, grouped under the heading', () => {
    const xml = renderTurn(OLD_MD, NEW_MD, STORE);
    // The sample inserts "brown " and deletes "lazy " under "# Field notes".
    expect(xml).toContain('<section heading="Field notes">');
    expect(xml).toMatch(/<ins>brown\s*<\/ins>/);
    expect(xml).toMatch(/<del>lazy\s*<\/del>/);
  });

  it('joins the anchor with its store comments as replies', () => {
    const xml = renderTurn(OLD_MD, NEW_MD, STORE);
    expect(xml).toMatch(/<thread id="t1" anchor="questionable claim" status="\w+">/);
    expect(xml).toContain('<reply>t1 open.</reply>');
    expect(xml).toContain('<reply>source for the speed claim?</reply>');
  });

  it('keeps store comment bodies out of the edits group', () => {
    // A reply mentioning unique text must never surface as a document edit —
    // comments are not document content.
    const store: Thread[] = [
      { id: 't1', comments: [{ seq: 1, author: 'rjs', created: 'x', body: 'see field log p.4' }] },
    ];
    const xml = renderTurn(OLD_MD, NEW_MD, store);
    const edits = xml.slice(xml.indexOf('<edits'));
    expect(edits).not.toContain('field log');
  });

  it('renders a freshly-opened anchor with no store thread as reply-less', () => {
    // The lazy-create path: a NEW anchor exists before its first reply.
    const plain = '# Field notes\n\nThe quick brown fox jumped over the dog.';
    const xml = renderTurn(plain, NEW_MD, []);
    expect(xml).toContain('<thread id="t1" anchor="questionable claim" status="opened"></thread>');
  });

  it('threads are a delta: only opened / updated / resolved threads appear', () => {
    const since = '2026-06-01T00:00:00.000Z';
    const old = '# N\n\nThe :mark[a]{#t1} and :mark[b]{#t2} here.';
    const neu = '# N\n\nThe :mark[a]{#t1} and :mark[b]{#t2} and :mark[c]{#t3} here.'; // t3 opened
    const store: Thread[] = [
      // t1: only an OLD comment → unchanged → omitted.
      { id: 't1', comments: [{ seq: 1, author: 'rjs', created: '2026-01-01T00:00:00.000Z', body: 'old note' }] },
      // t2: an old comment AND a new one since `since` → updated.
      {
        id: 't2',
        comments: [
          { seq: 1, author: 'rjs', created: '2026-01-01T00:00:00.000Z', body: 'old' },
          { seq: 2, author: 'C', created: '2026-06-28T00:00:00.000Z', body: 'fresh reply' },
        ],
      },
      // t3: brand new this turn.
      { id: 't3', comments: [{ seq: 1, author: 'rjs', created: '2026-06-28T00:00:00.000Z', body: 'new q' }] },
    ];
    const xml = renderTurn(old, neu, store, since);
    expect(xml).toMatch(/<thread id="t3"[^>]*status="opened">/);
    expect(xml).toMatch(/<thread id="t2"[^>]*status="updated">/);
    expect(xml).toContain('<reply>fresh reply</reply>'); // updated thread shows FULL state
    expect(xml).toContain('<reply>old</reply>');
    expect(xml).not.toContain('id="t1"'); // unchanged → omitted
  });

  it('compares "since" as an instant, not a string (mixed time zones)', () => {
    // Reply created 08:28 UTC; boundary 18:14+10:00 == 08:14 UTC → reply IS newer,
    // even though lexically "08…" < "18…". Guards the cross-zone compare.
    const old = 'The :mark[a]{#t1} here.';
    const store: Thread[] = [
      { id: 't1', comments: [{ seq: 1, author: 'rjs', created: '2026-06-29T08:28:00.000Z', body: 'fresh' }] },
    ];
    const xml = renderTurn(old, old, store, '2026-06-29T18:14:00+10:00');
    expect(xml).toMatch(/<thread id="t1"[^>]*status="updated">/); // reported as updated
  });

  it('reports a resolved thread once, as status="resolved"', () => {
    const since = '2026-06-01T00:00:00.000Z';
    const old = 'The :mark[a]{#t1} and :mark[b]{#t2}.';
    const neu = 'The :mark[a]{#t1} and b.'; // t2 resolved
    // t1 has only an old comment → unchanged; t2 is gone from the store.
    const store: Thread[] = [
      { id: 't1', comments: [{ seq: 1, author: 'r', created: '2026-01-01T00:00:00.000Z', body: 'x' }] },
    ];
    const xml = renderTurn(old, neu, store, since);
    expect(xml).toMatch(/<thread id="t2" anchor="b" status="resolved"\s*\/?>/);
    expect(xml).not.toContain('id="t1"'); // unchanged → omitted
  });

  it('bridges a short retained gap into one <del>/<ins> pair rather than splitting the edit', () => {
    // Mirrors changes.test.ts's bridging case: two word-replacements 3 words
    // apart ("dog"→"cat", "rug"→"mat") should read as ONE whole-span replace,
    // not four separate word-level fragments.
    const oldMd = 'the dog sat on the rug';
    const newMd = 'the cat sat on the mat';
    const xml = renderTurn(oldMd, newMd);
    const edits = xml.slice(xml.indexOf('<edits'));
    expect((edits.match(/<del>/g) ?? []).length).toBe(1);
    expect((edits.match(/<ins>/g) ?? []).length).toBe(1);
    expect(edits).toContain('<del>dog sat on the rug</del>');
    expect(edits).toContain('<ins>cat sat on the mat</ins>');
  });

  it('groups edits by their enclosing heading', () => {
    const oldMd = ['# A', '', 'one two three', '', '## B', '', 'four five six'].join('\n');
    const newMd = ['# A', '', 'one X three', '', '## B', '', 'four five Y six'].join('\n');
    const xml = renderTurn(oldMd, newMd);
    const aIdx = xml.indexOf('<section heading="A">');
    const bIdx = xml.indexOf('<section heading="B">');
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);
    expect(xml).toMatch(/<ins>\s*X\s*<\/ins>/);
    expect(xml).toMatch(/<ins>\s*Y\s*<\/ins>/);
  });

  it('unwraps anchor directives: editing a marked span shows plain text, not the directive', () => {
    const oldMd = 'Body with a :mark[good claim]{#t1} here.';
    const newMd = 'Body with a :mark[great claim]{#t1} here.';
    const xml = renderTurn(oldMd, newMd);
    const edits = xml.slice(xml.indexOf('<edits'));
    expect(edits).not.toContain('mark'); // no :mark scaffolding
    expect(edits).not.toContain('{#'); // no directive id
    expect(edits).toMatch(/<ins>great\s*<\/ins>/);
    expect(edits).toMatch(/<del>good\s*<\/del>/);
  });

  it('emits self-closed groups when there are no threads / no edits', () => {
    const md = ['# Title', '', 'unchanged body text'].join('\n');
    const xml = renderTurn(md, md);
    expect(xml).toContain('<threads/>');
    expect(xml).toContain('<edits/>');
  });

  it('XML-escapes content', () => {
    const oldMd = '# H\n\nplain text here';
    const newMd = '# H\n\nplain text <b> & "q" here';
    const xml = renderTurn(oldMd, newMd);
    expect(xml).toContain('&lt;b&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).not.toMatch(/<ins>[^<]*<b>/); // raw tag never leaks into output
  });
});
