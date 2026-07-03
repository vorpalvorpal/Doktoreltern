/**
 * jsdom bootstrap shared by every Node-side script that needs a headless
 * Milkdown editor (`scripts/canonicalize.ts`, `scripts/thread.ts`). Milkdown +
 * ProseMirror reference a handful of DOM globals directly (not through an
 * injected `document`), so we install jsdom's globals onto `globalThis` before
 * any editor-dependent module is imported.
 *
 * Call {@link bootstrapDom} once, at the top of the script, BEFORE any dynamic
 * `import()` of editor-dependent code — the globals must exist when those
 * modules first touch them.
 */
import { JSDOM } from 'jsdom';

export function bootstrapDom(): void {
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
}
