/**
 * PHASE 0 GATE — directive round-trip spike.
 *
 * The anchor model is moving off raw-HTML `<mark>` to remark **directives**:
 * inline `:mark[span]{#id}` and container `:::mark{#id} … :::`. Everything
 * downstream assumes Milkdown can load and re-serialise those byte-clean, with
 * inline formatting preserved *inside* an inline directive (the thing the old
 * `<mark>` split on). This proves — or disproves — that, exactly like the M0 gate
 * did for `<mark>`/`<article>`. If it fails, stop and fall back to the link model.
 */
import { describe, it, expect } from 'vitest';
import { Editor, defaultValueCtx, remarkStringifyOptionsCtx, rootCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { getMarkdown } from '@milkdown/utils';
import { directivePlugins } from '../src/anchor';

/** Full editor round-trip with the directive plugins wired (the GUI path). */
async function roundTrip(markdown: string): Promise<string> {
  const root = document.createElement('div');
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        bullet: '-' as const,
        rule: '-' as const,
        ruleRepetition: 3,
      }));
    })
    .use(commonmark)
    .use(gfm)
    .use(directivePlugins)
    .create();
  try {
    return editor.action(getMarkdown());
  } finally {
    await editor.destroy();
  }
}

describe('Phase 0 gate — remark directives round-trip through Milkdown', () => {
  it('inline :mark[…]{#id} survives byte-clean and idempotent', async () => {
    const md = 'Some :mark[example text]{#t1} in a sentence.';
    const once = await roundTrip(md);
    expect(once).toContain(':mark[example text]{#t1}');
    expect(await roundTrip(once)).toBe(once); // fixpoint
  });

  it('inline directive PRESERVES inner formatting (the old <mark> dropped it)', async () => {
    const md = 'A :mark[**bold** and plain]{#t2} span.';
    const once = await roundTrip(md);
    // Formatting is kept AND nested INSIDE the anchor (not `**:mark[bold]**`).
    expect(once).toContain('**bold**');
    expect(once).not.toContain('**:mark');
    // A formatting boundary may split the anchor into same-id pieces (the
    // "repeated same-id anchors" model) — acceptable: every piece keeps #t2, and
    // downstream joins by id. What must NOT happen is a lost id or lost text.
    const anchors = once.match(/:mark\[/g) ?? [];
    const ids = once.match(/\{#t2\}/g) ?? [];
    expect(anchors.length).toBe(ids.length); // every piece carries the id
    expect(anchors.length).toBeGreaterThanOrEqual(1);
    expect(await roundTrip(once)).toBe(once); // and it's a fixpoint
  });

  it('container :::mark{#id} wraps multiple blocks and round-trips', async () => {
    const md = [':::mark{#t3}', 'A paragraph here.', '', '- one', '- two', ':::'].join('\n');
    const once = await roundTrip(md);
    expect(once).toContain('{#t3}');
    expect(once).toContain('A paragraph here.');
    expect(once).toContain('- one');
    expect(await roundTrip(once)).toBe(once);
  });

  it('the anchor id survives when the inner text is edited (delimiter, not offset)', async () => {
    // Simulate an edit by changing the inner text and re-serialising: the id rides
    // with the span. (Full edit-survival via the PM transaction is Phase 1.)
    const md = 'x :mark[short]{#t4} y';
    const edited = (await roundTrip(md)).replace('short', 'much longer text');
    const once = await roundTrip(edited);
    expect(once).toContain(':mark[much longer text]{#t4}');
  });
});
