/**
 * Sample documents for the read-view demo and the integration test.
 *
 * `OLD_MD` is the previous version, `NEW_MD` is "Claude's edit". They differ in
 * the body (an insertion and a deletion) and both carry a `<mark>` comment
 * anchor + matching `<article>` foot-region thread, so the demo exercises every
 * read-view feature: insert decoration, delete widget, and a sidebar thread.
 *
 * Body diff (above the final `---`):
 *   - inserted: "brown " before "fox"  (one inserted word)
 *   - deleted:  "lazy "   before "dog" (one deleted word)
 * The foot-region `<article>` differs too — and must NOT diff (foot-region rule).
 */

export const OLD_MD = [
  '# Field notes',
  '',
  'The quick fox jumped over the lazy dog while we watched from the',
  'ridge with a :mark[questionable claim]{#t1} about its speed.',
  '',
  '- observed at dawn',
  '- weather was clear',
  '',
  '---',
  '',
  '<article data-thread="t1">t1 open.<br>rjs: source for the speed claim?</article>',
].join('\n');

export const NEW_MD = [
  '# Field notes',
  '',
  'The quick brown fox jumped over the dog while we watched from the',
  'ridge with a :mark[questionable claim]{#t1} about its speed.',
  '',
  '- observed at dawn',
  '- weather was clear',
  '',
  '---',
  '',
  '<article data-thread="t1">t1 open.<br>rjs: source for the speed claim?<br>C: added, see field log p.4.</article>',
].join('\n');
