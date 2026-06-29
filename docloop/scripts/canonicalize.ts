/**
 * CLI: canonicalise markdown file(s) in place to the docloop GUI's persisted form.
 *
 * The normalisation step for the LLM→md side of the loop. In v0 the MCP is hand-
 * simulated, so a Claude turn ends by editing `workspace/doc.md`, running this,
 * then committing — guaranteeing the commit is byte-identical to what the GUI
 * would save (clean diffs on the next turn). Run with vite-node (resolves the TS
 * + extensionless imports):
 *
 *     npm run canonicalize -- workspace/doc.md
 *
 * The headless editor needs a DOM, so we bootstrap jsdom before importing the
 * editor-dependent code (dynamic import, after the globals exist).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
// Some of these globals are read-only in Node 22 (e.g. `navigator`); define each
// defensively and skip any that can't be set — Node's own value is fine there.
const define = (name: string, value: unknown) => {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  } catch {
    /* read-only global already present (e.g. navigator) — leave it */
  }
};
define('window', dom.window);
define('document', dom.window.document);
define('navigator', dom.window.navigator);

// Constructors / classes ProseMirror + Milkdown reference as bare globals.
for (const name of [
  'DOMParser',
  'Node',
  'HTMLElement',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver',
] as const) {
  define(name, dom.window[name as keyof typeof dom.window]);
}

// Window methods Milkdown's timer system + the PM view call as bare globals
// (addEventListener/dispatchEvent drive Milkdown's ctx timers). Bind to window.
for (const name of [
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getSelection',
] as const) {
  const fn = dom.window[name as keyof typeof dom.window];
  if (typeof fn === 'function') define(name, (fn as (...a: unknown[]) => unknown).bind(dom.window));
}

// Import only after the DOM globals are in place (ProseMirror touches them).
const { canonicalize } = await import('../src/canonicalize.ts');

const files = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (files.length === 0) {
  console.error('usage: canonicalize <file.md> [more.md ...]');
  process.exit(1);
}

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  const after = await canonicalize(before);
  if (after !== before) writeFileSync(file, after, 'utf8');
  console.log(`${file}: ${after === before ? 'already canonical' : 'normalised'}`);
}
