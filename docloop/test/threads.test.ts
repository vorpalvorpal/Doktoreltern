import { describe, it, expect } from 'vitest';
import { extractThreads, splitTurns } from '../src/threads';

describe('extractThreads', () => {
  it('joins a :mark anchor with its <article> body by thread id', () => {
    const md = [
      'A sentence with a :mark[commented span]{#t1} in it.',
      '',
      '---',
      '',
      '<article data-thread="t1">the thread body</article>',
    ].join('\n');
    expect(extractThreads(md)).toEqual([
      { id: 't1', anchor: 'commented span', body: 'the thread body' },
    ]);
  });

  it('returns threads in document order of their anchors', () => {
    const md = [
      ':mark[second]{#t2} then :mark[first]{#t1}.',
      '',
      '---',
      '<article data-thread="t1">b1</article>',
      '<article data-thread="t2">b2</article>',
    ].join('\n');
    expect(extractThreads(md).map((t) => t.id)).toEqual(['t2', 't1']);
  });

  it('reports an orphan anchor (no matching article) with body null', () => {
    const md = 'An :mark[orphan]{#t9} mark.';
    expect(extractThreads(md)).toEqual([
      { id: 't9', anchor: 'orphan', body: null },
    ]);
  });
});

describe('splitTurns', () => {
  it('splits a <br>-joined body into trimmed turns', () => {
    expect(splitTurns('t1 open.<br>rjs: source?<br>C: added.')).toEqual([
      't1 open.',
      'rjs: source?',
      'C: added.',
    ]);
  });

  it('returns a single turn when there are no <br> separators', () => {
    expect(splitTurns('just one note')).toEqual(['just one note']);
  });

  it('tolerates <br/> and <br /> variants and drops empty turns', () => {
    expect(splitTurns('a<br/>b<br />c<br>')).toEqual(['a', 'b', 'c']);
  });
});
