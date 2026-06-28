import { describe, it, expect } from 'vitest';
import { addThread, appendReply, removeThread } from '../src/foot';
import { extractThreads } from '../src/threads';

const countRules = (md: string) => (md.match(/^---\s*$/gm) ?? []).length;

describe('foot-region thread ops', () => {
  it('addThread appends an <article>, creating the --- foot-region if absent', () => {
    const md = 'Body with a <mark data-thread="t1">span</mark>.';
    const out = addThread(md, 't1', 'first comment');
    expect(out).toContain('<article data-thread="t1">first comment</article>');
    expect(countRules(out)).toBe(1); // foot-region delimiter created
    // the body (and its <mark>) above the delimiter is untouched
    expect(out).toContain('Body with a <mark data-thread="t1">span</mark>.');
    // and the new article is part of a recognised thread
    expect(extractThreads(out).find((t) => t.id === 't1')?.body).toContain('first comment');
  });

  it('addThread reuses an existing foot-region (one delimiter only)', () => {
    const md = 'Body.\n\n---\n\n<article data-thread="t1">one</article>';
    const out = addThread(md, 't2', 'two');
    expect(out).toContain('<article data-thread="t1">one</article>');
    expect(out).toContain('<article data-thread="t2">two</article>');
    expect(countRules(out)).toBe(1);
  });

  it('appendReply adds to an existing thread body, keeping the original', () => {
    const md = 'Body.\n\n---\n\n<article data-thread="t1">question?</article>';
    const out = appendReply(md, 't1', 'answer!');
    const body = extractThreads(out).find((t) => t.id === 't1')?.body ?? '';
    expect(body).toContain('question?');
    expect(body).toContain('answer!');
  });

  it('removeThread unwraps the <mark> in the body and deletes the <article>', () => {
    const md =
      'A <mark data-thread="t1">span</mark> here.\n\n---\n\n<article data-thread="t1">body</article>';
    const out = removeThread(md, 't1');
    expect(out).toContain('A span here.'); // mark unwrapped to plain text
    expect(out).not.toContain('data-thread="t1"'); // both mark and article gone
  });

  it('removeThread leaves other threads intact', () => {
    const md =
      'X <mark data-thread="t1">a</mark> Y <mark data-thread="t2">b</mark>.\n\n---\n\n<article data-thread="t1">one</article>\n<article data-thread="t2">two</article>';
    const out = removeThread(md, 't1');
    expect(out).not.toContain('data-thread="t1"');
    expect(out).toContain('<mark data-thread="t2">b</mark>');
    expect(out).toContain('<article data-thread="t2">two</article>');
  });
});
