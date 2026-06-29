/**
 * M0 gate: parse markdown into a Milkdown/ProseMirror document and serialise it
 * back to markdown. The whole architecture rests on this being faithful, so this
 * function is the thing the M0 tests exercise.
 *
 * Contract: `roundTrip(md)` returns the markdown Milkdown produces after parsing
 * `md` and serialising it again — i.e. what would be saved if a user opened the
 * doc in the editor and saved it untouched.
 *
 * Approach: a REAL headless Milkdown `Editor` running on a jsdom DOM. We feed the
 * markdown in via `defaultValueCtx`, let the editor build its ProseMirror state,
 * then read it back with the `getMarkdown()` macro. `getMarkdown()` pulls the
 * editor's own `serializerCtx` (the remark-stringify pipeline configured by the
 * presets), so this is byte-for-byte what the live editor would save — not a
 * side parser. A real editor (rather than the bare transformer) is required
 * because the CommonMark paragraph serialiser reaches for `editorViewCtx`, which
 * only exists once an editor view has been created.
 */
import {
  Editor,
  defaultValueCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
} from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { getMarkdown } from '@milkdown/utils';
import { directivePlugins } from './anchor';

export async function roundTrip(markdown: string): Promise<string> {
  // jsdom (provided by the Vitest `jsdom` environment) gives us `document`,
  // which Milkdown's view layer needs. A detached element is enough — nothing
  // has to be on screen for parse → serialise.
  const root = document.createElement('div');

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
      // Pin the remark-stringify markdown *style* so the serialiser matches how
      // a human writes the doc, instead of remark's defaults (which would
      // rewrite `- item` -> `* item` and the `---` foot-region delimiter
      // -> `***`). These are cosmetic for parsing, but the storage scheme greps
      // for a literal `---` before the foot-region, so we keep it literal.
      // We merge, not replace: the default `handlers`/`encode: []` carry the
      // raw-HTML-friendly behaviour (no entity-encoding of `<` `>`), so we must
      // not clobber them.
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        bullet: '-' as const, // bullet lists use `-`
        rule: '-' as const, // thematic break / foot-region delimiter uses `-`
        ruleRepetition: 3, // `---`, not `-----`
      }));
    })
    // commonmark carries the inline/block raw-HTML handling (html node +
    // remarkHtmlTransformer); gfm adds tables/strikethrough/etc. so the editor
    // matches what docloop will actually run.
    .use(commonmark)
    .use(gfm)
    // Same anchor directives as the live editor, so the pre-canonicalise pass
    // (editor.ts) doesn't mangle `:mark…` into escaped text.
    .use(directivePlugins)
    .create();

  try {
    // Read the doc back out through the editor's own serializer — the exact
    // markdown the editor would persist on save.
    return editor.action(getMarkdown());
  } finally {
    // Tear the editor down so each call is independent and we leak no views.
    await editor.destroy();
  }
}
