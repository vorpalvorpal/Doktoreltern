/**
 * Serialise calls to an async function onto one chain, so overlapping calls
 * queue instead of running concurrently. Extracted as its own small, directly
 * testable unit rather than an inline closure, because the bug it fixes was
 * genuinely subtle: `rerender()` in main.ts is fired `void`-style ("fire and
 * forget") from most call sites (a highlight, a click), and its body awaits
 * several async steps while mutating SHARED state (torn-down/rebuilt comment
 * editors, the sidebar DOM, focus-transfer bookkeeping) — two calls started
 * close together used to run concurrently, and whichever finished last would
 * clobber whatever the other had just built.
 *
 * A run that throws doesn't block the queue (the error is caught and passed
 * to `onError`) — one bad render shouldn't wedge every future one. Each
 * caller still gets back a promise for THEIR OWN specific run (resolving or
 * rejecting with that run's own outcome), even though the queue itself never
 * stops advancing.
 */
export function createSerialQueue(onError: (err: unknown) => void = () => {}) {
  let chain: Promise<void> = Promise.resolve();

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const result = chain.then(fn);
    chain = result.then(
      () => undefined,
      (err) => {
        onError(err);
      },
    );
    return result;
  };
}
