/**
 * Editor construction shared by the GUI (src/main.ts) and the jsdom integration
 * test. A real headless Milkdown editor (same commonmark+gfm preset + stringify
 * pins as the M0 gate) so the doc we decorate is byte-identical to what M0
 * proved round-trips.
 */
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  parserCtx,
  rootCtx,
} from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import type { MilkdownPlugin } from '@milkdown/ctx';
import type { EditorView } from '@milkdown/prose/view';
import type { Node as PMNode } from '@milkdown/prose/model';
import { configureStringify } from './editor-preset';
import { directivePlugins } from './anchor';
import { roundTrip } from './roundtrip';

export interface DocloopEditor {
  editor: Editor;
  view: EditorView;
  /** Parse a markdown string into a doc using the editor's own parser. */
  parse(markdown: string): PMNode;
  destroy(): Promise<void>;
}

/**
 * Build a read-only-ish editor on `root`, loaded with `markdown`.
 *
 * IMPORTANT — canonicalise on import: we first run `markdown` through
 * `roundTrip()` and load *that*. The editor normalises loose lists / spacing on
 * its first parse→serialise; if we diffed against the un-normalised source those
 * cosmetic edits would show up as spurious inserts/deletes. Loading the
 * already-normalised text makes the baseline a fixpoint (M0 proved the 2nd pass
 * is a no-op), so only genuine content changes diff.
 */
export async function createEditor(
  root: HTMLElement,
  markdown: string,
  opts: { editable?: boolean; plugins?: MilkdownPlugin[] } = {},
): Promise<DocloopEditor> {
  const canonical = await roundTrip(markdown);

  let make = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, canonical);
      configureStringify(ctx);
    })
    .config((ctx) => {
      // M1 is a read view: editing is M2. Make the view non-editable.
      const editable = opts.editable ?? false;
      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        editable: () => editable,
      }));
    })
    .use(commonmark)
    .use(gfm)
    // The comment-anchor directive schema (Phase 1): inline `:mark[…]{#id}` → a
    // PM mark, container `:::mark{#id}…:::` → a PM node, both surviving editing.
    // Replaces the raw-HTML `<mark>` (which dropped inline formatting). Registered
    // for the read view too so the schema is present everywhere the doc loads.
    .use(directivePlugins);

  // Extra ProseMirror plugins (e.g. the decoration painter) registered last so
  // they sit on top of the preset.
  for (const plugin of opts.plugins ?? []) make = make.use(plugin);

  const editor = await make.create();

  const view = editor.ctx.get(editorViewCtx);

  return {
    editor,
    view,
    parse(md: string): PMNode {
      const parser = editor.ctx.get(parserCtx);
      const doc = parser(md);
      if (!doc) throw new Error('parser returned no doc for markdown');
      return doc;
    },
    destroy: async () => {
      await editor.destroy();
    },
  };
}
