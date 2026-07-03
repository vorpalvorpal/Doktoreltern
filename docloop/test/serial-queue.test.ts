import { describe, it, expect, vi } from 'vitest';
import { createSerialQueue } from '../src/serial-queue';

// Regression coverage for the rerender() race in main.ts: `rerender` is fired
// `void`-style ("fire and forget") from many call sites, and its body awaits
// several async steps while mutating shared state. Two calls started close
// together used to run concurrently, and whichever finished last would
// clobber whatever the other had just built — confirmed live, two rapid
// highlights (a second thread created before the first's rerender had
// settled) could leave the sidebar with zero threads rendered at all. These
// tests exercise the queueing mechanism directly, deterministically (no
// browser/timing flakiness), rather than relying on live reproduction.

describe('createSerialQueue', () => {
  it('never runs two queued calls concurrently', async () => {
    const run = createSerialQueue();
    let active = 0;
    let overlapped = false;

    const task = () => {
      active++;
      if (active > 1) overlapped = true;
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          active--;
          resolve();
        }, 10),
      );
    };

    // Fire two calls back-to-back with no await between them — exactly the
    // "fire and forget" shape `void rerender(app)` uses at each call site.
    const p1 = run(task);
    const p2 = run(task);
    await Promise.all([p1, p2]);

    expect(overlapped).toBe(false);
  });

  it('prevents a shared-state race (the exact shape of the bug: a later call resetting an array a concurrent call was still building)', async () => {
    const run = createSerialQueue();
    // Mirrors app.commentEditors: torn down and rebuilt by every render.
    const shared: string[] = [];

    const rebuild = (label: string) =>
      async () => {
        shared.length = 0; // "tear down" — this is what clobbered the other call's work
        await new Promise((r) => setTimeout(r, 5));
        shared.push(label); // "rebuild"
      };

    const p1 = run(rebuild('first'));
    const p2 = run(rebuild('second'));
    await Promise.all([p1, p2]);

    // Without serialization this is flaky (either value can win, or the
    // array can end up empty if a later reset lands between the two
    // pushes). With serialization, run order is deterministic: whichever
    // call was queued last runs strictly after the first completes.
    expect(shared).toEqual(['second']);
  });

  it("a throwing call doesn't wedge the queue for later calls", async () => {
    const onError = vi.fn();
    const run = createSerialQueue(onError);

    const failing = run(() => Promise.reject(new Error('boom')));
    await expect(failing).rejects.toThrow('boom');
    expect(onError).toHaveBeenCalledTimes(1);

    const after = await run(() => Promise.resolve('still works'));
    expect(after).toBe('still works');
  });

  it('each caller gets back a promise for their own run, not the whole future chain', async () => {
    const run = createSerialQueue();
    const order: string[] = [];

    const first = run(async () => {
      order.push('first-start');
      await new Promise((r) => setTimeout(r, 10));
      order.push('first-end');
      return 1;
    });
    const second = run(async () => {
      order.push('second-start');
      return 2;
    });

    expect(await first).toBe(1);
    expect(await second).toBe(2);
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });
});
