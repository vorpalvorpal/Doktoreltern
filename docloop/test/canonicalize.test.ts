import { describe, it, expect } from 'vitest';
import { canonicalize } from '../src/canonicalize';
import { getMarkdown } from '@milkdown/utils';
import { createEditor } from '../src/editor';

describe('canonicalize (LLM→md normalisation step)', () => {
  it('matches what the GUI editor would persist (getMarkdown)', async () => {
    const raw = '# H\n\nsome *text* with a :mark[span]{#t1}.\n';
    const viaCanon = await canonicalize(raw);

    const root = document.createElement('div');
    const ed = await createEditor(root, raw, { editable: true });
    const viaEditor = ed.editor.action(getMarkdown());
    await ed.destroy();

    expect(viaCanon).toBe(viaEditor);
  });

  it('is idempotent: canonical input round-trips to itself', async () => {
    const raw = ['# Title', '', '- a', '- b', '', 'A :mark[span]{#t1} here.'].join('\n');
    const once = await canonicalize(raw);
    const twice = await canonicalize(once);
    expect(twice).toBe(once);
  });

  it('normalises non-canonical markdown (the diff-noise the loop needs gone)', async () => {
    // `*` bullets + a `***` rule are valid markdown but not docloop-canonical
    // (the editor pins `-`). Canonicalising should rewrite them so a later diff
    // against a GUI-saved baseline is clean.
    const messy = '# H\n\n* one\n* two\n\n***\n\nbody';
    const out = await canonicalize(messy);
    expect(out).not.toContain('* one'); // bullets normalised to `-`
    expect(await canonicalize(out)).toBe(out); // and now stable
  });
});
