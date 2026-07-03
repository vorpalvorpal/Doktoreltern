/**
 * Canonicalise markdown to the **exact** form the docloop GUI persists.
 *
 * Both sides of the loop must emit byte-identical markdown or the git diff fills
 * with cosmetic noise (`<br>`→`<br />`, bullet/rule spacing, escaping, comment-
 * anchor re-serialisation). The human side gets this for free — the GUI saves
 * `getMarkdown()`. This is the same operation as a standalone function so the
 * **LLM→md side** (the MCP write boundary) can normalise its output before it
 * commits, instead of writing raw markdown that re-flows the next time the editor
 * touches it.
 *
 * It must go through the real editor (commonmark + gfm + `commentAnchorPlugins`),
 * not bare remark: the comment-anchor transform participates in the round-trip, so
 * only this path matches the GUI byte-for-byte. Needs a DOM (the ProseMirror
 * view) — in the browser that's the real document; in Node, bootstrap jsdom first
 * (see scripts/canonicalize.ts).
 *
 * Milkdown's serializer (`@milkdown/transformer`'s `SerializerState#runNode`)
 * unconditionally closes every mark on a PM text leaf with no lookahead at the
 * next leaf, so a `strong` mark that should stay open around a nested `em` gets
 * closed/reopened at each boundary — producing adjacent same-character delimiter
 * runs that a downstream escape guard "safely" turns into literal, visible `\*\*`
 * (a known, unfixed-for-this-case upstream bug: Milkdown/milkdown#704). Patching
 * Milkdown itself is out of scope (forking an unexported class in a pinned
 * dependency), so instead we detect and refuse: compare the flattened visible
 * text before/after the round-trip and throw rather than silently returning
 * corrupted output.
 */
import { getMarkdown } from '@milkdown/utils';
import { createEditor } from './editor';
import { buildBodyTextIndex } from './decorations';
import { contentDiffSummary } from './content-check';

export async function canonicalize(markdown: string): Promise<string> {
  const root = document.createElement('div');
  const ed = await createEditor(root, markdown, { editable: true });
  try {
    const output = ed.editor.action(getMarkdown());
    const before = buildBodyTextIndex(ed.parse(markdown)).text;
    const after = buildBodyTextIndex(ed.parse(output)).text;
    const diff = contentDiffSummary(before, after);
    if (diff) throw new Error(`canonicalize: content changed during normalisation (${diff})`);
    return output;
  } finally {
    await ed.destroy();
  }
}
