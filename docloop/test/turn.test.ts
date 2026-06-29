import { describe, it, expect } from 'vitest';
import { renderTurn } from '../src/turn';
import { OLD_MD, NEW_MD } from '../src/sample';

describe('renderTurn (M3 LLM-facing turn render)', () => {
  it('emits a <turn> with threads before edits (open items first)', () => {
    const xml = renderTurn(OLD_MD, NEW_MD);
    expect(xml.startsWith('<turn>')).toBe(true);
    expect(xml.trimEnd().endsWith('</turn>')).toBe(true);
    // Threads group is emitted before the edits group.
    expect(xml.indexOf('<threads')).toBeLessThan(xml.indexOf('<edits'));
  });

  it('renders the body diff as <ins>/<del>, grouped under the heading', () => {
    const xml = renderTurn(OLD_MD, NEW_MD);
    // The sample inserts "brown " and deletes "lazy " under "# Field notes".
    expect(xml).toContain('<section heading="Field notes">');
    expect(xml).toMatch(/<ins>brown\s*<\/ins>/);
    expect(xml).toMatch(/<del>lazy\s*<\/del>/);
  });

  it('renders the comment thread with its anchor and replies', () => {
    const xml = renderTurn(OLD_MD, NEW_MD);
    expect(xml).toContain('<thread id="t1" anchor="questionable claim">');
    expect(xml).toContain('<reply>t1 open.</reply>');
    expect(xml).toContain('<reply>rjs: source for the speed claim?</reply>');
  });

  it('excludes the foot-region: <article> bodies never become edits', () => {
    // The foot-region differs between OLD and NEW (a reply was added), but that
    // must not surface as a document edit.
    const xml = renderTurn(OLD_MD, NEW_MD);
    const edits = xml.slice(xml.indexOf('<edits'));
    expect(edits).not.toContain('field log'); // text added only in the <article>
    expect(edits).not.toContain('article');
  });

  it('groups edits by their enclosing heading', () => {
    const oldMd = ['# A', '', 'one two three', '', '## B', '', 'four five six'].join('\n');
    const newMd = ['# A', '', 'one X three', '', '## B', '', 'four five Y six'].join('\n');
    const xml = renderTurn(oldMd, newMd);
    // Edit in section A
    const aIdx = xml.indexOf('<section heading="A">');
    const bIdx = xml.indexOf('<section heading="B">');
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);
    // "X" is inserted under A, "Y" under B — both present (the word diff may
    // attach surrounding whitespace to the inserted token).
    expect(xml).toMatch(/<ins>\s*X\s*<\/ins>/);
    expect(xml).toMatch(/<ins>\s*Y\s*<\/ins>/);
  });

  it('unwraps anchor directives: editing a marked span shows plain text, not the directive', () => {
    const oldMd =
      'Body with a :mark[good claim]{#t1} here.\n\n---\n\n<article data-thread="t1">rjs: ok?</article>';
    const newMd =
      'Body with a :mark[great claim]{#t1} here.\n\n---\n\n<article data-thread="t1">rjs: ok?</article>';
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
