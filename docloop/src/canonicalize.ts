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
 */
import { getMarkdown } from '@milkdown/utils';
import { createEditor } from './editor';

export async function canonicalize(markdown: string): Promise<string> {
  const root = document.createElement('div');
  const ed = await createEditor(root, markdown, { editable: true });
  try {
    return ed.editor.action(getMarkdown());
  } finally {
    await ed.destroy();
  }
}
