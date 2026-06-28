/**
 * The comment-anchor as a real ProseMirror **schema mark** (M2, Step 1 — the
 * "road bump").
 *
 * ## Why this exists
 * In M1, `<mark data-thread="id">…</mark>` was parsed by remark into three flat
 * inline nodes — `html("<mark …>")`, `text("…")`, `html("</mark>")` — and each
 * `html` node became an *atom* ProseMirror node (see the old `findMarkHighlights`
 * in decorations.ts). That is fine for a read-only view, but it does **not**
 * survive live editing: the open/close tags are opaque atoms, so typing "inside"
 * the anchor actually types *between* the close atom and the following text, and
 * the `<mark>` desyncs from the span it was supposed to wrap.
 *
 * The fix is to promote the anchor to a proper mark (like bold or link): a
 * `commentAnchor` mark carrying a `threadId` attr. Marks ride *with* the text, so
 * inserting/deleting inside the span keeps the text marked, and serialisation
 * re-wraps the *edited* text. The edit-survival proof is in
 * `test/comment-mark.test.ts`.
 *
 * ## How parse/serialize is wired into Milkdown
 * Milkdown's markdown pipeline is mdast-based: remark parses markdown → mdast,
 * a parser maps mdast → ProseMirror, a serializer maps ProseMirror → mdast,
 * remark-stringify renders mdast → markdown.
 *
 * - **Parse** (markdown → mark): a remark transformer (`remarkCommentAnchor`)
 *   runs on the mdast tree and collapses each `[html-open, …inner, html-close]`
 *   sibling run into a single synthetic `commentAnchor` mdast node holding the
 *   `threadId` and the inner children. The mark schema's `parseMarkdown` then
 *   matches that node, opens the mark, recurses into the children, and closes it.
 *   (`<ins>`/`<del>` are deliberately untouched — they stay raw `html` nodes and
 *   remain the concern of the diff layer.)
 *
 * - **Serialize** (mark → markdown): the mark schema's `toMarkdown` runner emits
 *   three sibling mdast nodes — an `html` node with the literal
 *   `<mark data-thread="id">` open tag, a `text` node with the span text, and an
 *   `html` node with `</mark>`. remark-stringify renders `html` nodes verbatim,
 *   so the output is byte-clean `<mark data-thread="id">text</mark>` with no
 *   escaping. This is what keeps the **M0 gate** green (it asserts exactly that
 *   string survives a round-trip).
 */
import { $markSchema, $remark } from '@milkdown/utils';
import type { MilkdownPlugin } from '@milkdown/ctx';

/** The mark's name in the ProseMirror schema and the synthetic mdast node type. */
export const COMMENT_ANCHOR = 'commentAnchor';

// `<mark data-thread="ID">` open tag / `</mark>` close tag, exactly as stored.
const OPEN_RE = /^<mark\s+data-thread="([^"]+)">$/;
const CLOSE_RE = /^<\/mark>$/;

/**
 * remark transformer: fold `<mark …>text</mark>` html-node runs into single
 * `commentAnchor` mdast nodes so the ProseMirror parser can turn them into the
 * mark. Walks depth-first; `<mark>` doesn't nest in our docs but we count depth
 * defensively so a stray nested open doesn't mis-pair the close.
 */
const remarkCommentAnchor = $remark('remarkCommentAnchor', () => () => (tree: unknown) => {
  const visit = (node: { children?: unknown[] } | unknown): void => {
    const parent = node as { children?: any[] };
    if (!Array.isArray(parent.children)) return;

    const out: any[] = [];
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      const open = child?.type === 'html' ? OPEN_RE.exec(String(child.value).trim()) : null;

      if (open) {
        // Scan forward for the matching close, collecting inner siblings.
        let depth = 0;
        let j = i + 1;
        const inner: any[] = [];
        for (; j < parent.children.length; j++) {
          const c = parent.children[j];
          if (c?.type === 'html' && OPEN_RE.test(String(c.value).trim())) {
            depth++;
          } else if (c?.type === 'html' && CLOSE_RE.test(String(c.value).trim())) {
            if (depth === 0) break;
            depth--;
          }
          inner.push(c);
        }
        if (j < parent.children.length) {
          // Recurse into the inner nodes (e.g. nested formatting) before wrapping.
          inner.forEach(visit);
          out.push({ type: COMMENT_ANCHOR, threadId: open[1], children: inner });
          i = j; // skip past the consumed close tag
          continue;
        }
        // No close found: fall through and treat the open as a plain html node.
      }

      visit(child);
      out.push(child);
    }
    parent.children = out;
  };

  visit(tree);
});

/**
 * The `commentAnchor` mark: a `threadId` attr, DOM `<mark data-thread>` mapping,
 * and the markdown parse/serialize runners described in the module header.
 *
 * `inclusive: true` (the ProseMirror default for non-link marks, set explicitly
 * here for clarity) so typing at either edge of the anchor extends the mark —
 * keeping the anchor glued to its span through edits.
 */
const commentAnchorSchema = $markSchema(COMMENT_ANCHOR, () => ({
  inclusive: true,
  attrs: { threadId: { default: '', validate: 'string' } },
  parseDOM: [
    {
      tag: 'mark[data-thread]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return { threadId: el.getAttribute('data-thread') ?? '' };
      },
    },
  ],
  toDOM: (mark) => [
    'mark',
    { 'data-thread': mark.attrs.threadId as string, class: 'docloop-mark' },
    0,
  ],
  parseMarkdown: {
    match: (node) => (node as { type?: string }).type === COMMENT_ANCHOR,
    runner: (state, node, markType) => {
      state.openMark(markType, { threadId: (node as any).threadId });
      state.next((node as any).children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === COMMENT_ANCHOR,
    // Emit `<mark …>`, the span text, and `</mark>` as three sibling mdast
    // nodes; remark-stringify renders `html` nodes verbatim → byte-clean output.
    // Returning a truthy value tells the serializer this mark fully rendered the
    // node, so it does not also emit the text itself (which would duplicate it).
    // NOTE: this assumes the anchor wraps a plain text span (our storage scheme).
    // If a single text node ever carried BOTH commentAnchor and another mark,
    // that other mark would be dropped — not a case the doc format produces.
    runner: (state, mark, node) => {
      const id = mark.attrs.threadId as string;
      state.addNode('html', undefined, `<mark data-thread="${id}">`);
      state.addNode('text', undefined, (node as { text?: string }).text ?? '');
      state.addNode('html', undefined, '</mark>');
      return true;
    },
  },
}));

/**
 * The `$markSchema` handle (a `[schemaCtx, schema]` plugin tuple with extras).
 * Exported so the write UI can read the `commentAnchor` `MarkType` from the live
 * editor via `commentAnchorMark.type(ctx)` and apply it to a selection.
 */
export const commentAnchorMark = commentAnchorSchema;

/**
 * Drop-in plugin bundle: the remark transformer plus the mark schema, flattened
 * into one plugin list ready for `Editor.use(...)`. Both `$remark` and
 * `$markSchema` are themselves `[ctx, plugin]` tuples, so we spread them. The
 * transformer is listed first to mirror the parse-then-map data flow.
 */
export const commentAnchorPlugins: MilkdownPlugin[] = [
  ...remarkCommentAnchor,
  ...commentAnchorSchema,
];
