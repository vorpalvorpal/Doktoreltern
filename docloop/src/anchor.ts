/**
 * Comment anchors as remark **directives** (Phase 1 — replaces the raw-HTML
 * `<mark>` of comment-mark.ts).
 *
 * Two shapes, both carrying a thread id and both rendered as a highlight:
 *   - **inline**:    `:mark[span text]{#id}`        → a ProseMirror **mark**
 *   - **container**: `:::mark{#id}` … blocks … `:::` → a ProseMirror **node**
 *
 * ## Why directives (not `<mark>`)
 * `<mark>` is raw inline HTML: its content isn't markdown, and our naive mark
 * serializer emitted one `<mark>` *per text-run*, so an anchor over `*emphasis*`
 * split into two tags and dropped the formatting. A directive is a first-class
 * markdown construct whose content is parsed markdown, and the mark serializer
 * uses `withMark` — which **coalesces** adjacent runs sharing the anchor and
 * renders inner marks *inside* the delimiters. So `:mark[**bold** x]{#id}`
 * survives intact. Directives are also self-identifying (`mark`), so there is no
 * disambiguation against real links/HTML.
 *
 * ## Pipeline (same mdast-based flow as Milkdown's presets)
 * `remark-directive` parses `:mark…`/`:::mark…` into `textDirective` /
 * `containerDirective` mdast nodes (and stringifies them back). The schema below
 * maps those nodes ↔ ProseMirror: the mark/node `parseMarkdown` matches the
 * directive by `name === 'mark'` and reads `attributes.id`; `toMarkdown` re-emits
 * the directive carrying that id. The id rides *with* the span, so editing or
 * moving the marked text keeps the anchor glued to it (no offsets).
 */
import { $markSchema, $nodeSchema, $remark } from '@milkdown/utils';
import type { MilkdownPlugin } from '@milkdown/ctx';
import directive from 'remark-directive';

export const COMMENT_ANCHOR = 'commentAnchor';
export const COMMENT_BLOCK = 'commentBlock';

/** Directive name that marks our anchors (`:mark…` / `:::mark…`). */
const NAME = 'mark';

/** Pull the thread id from a directive node's attributes (`{#id}`). */
const idOf = (node: unknown): string =>
  String((node as { attributes?: { id?: string } }).attributes?.id ?? '');

/** remark-directive: parse/stringify `:mark[…]{#id}` and `:::mark{#id}…:::`. */
const remarkDirective = $remark('remarkDirective', () => directive);

/**
 * Inline anchor mark ↔ `textDirective` named `mark`. `inclusive` so typing at the
 * edges extends the anchor. `toMarkdown` uses `withMark` so a span over formatted
 * text serialises as ONE directive with the formatting inside it.
 */
const commentAnchorSchema = $markSchema(COMMENT_ANCHOR, () => ({
  inclusive: true,
  // Serialise outermost (default mark priority is 50) so a span over formatted
  // text nests the formatting INSIDE the directive (`:mark[**bold**]`), never the
  // other way round (`**:mark[bold]**`). See the serializer's #runNode sort.
  priority: 0,
  attrs: { threadId: { default: '', validate: 'string' } },
  parseDOM: [
    {
      tag: 'mark[data-thread]',
      getAttrs: (dom) => ({ threadId: (dom as HTMLElement).getAttribute('data-thread') ?? '' }),
    },
  ],
  toDOM: (mark) => [
    'mark',
    { 'data-thread': mark.attrs.threadId as string, class: 'docloop-mark' },
    0,
  ],
  parseMarkdown: {
    match: (node) => (node as { type?: string }).type === 'textDirective' && (node as any).name === NAME,
    runner: (state, node, markType) => {
      state.openMark(markType, { threadId: idOf(node) });
      state.next((node as any).children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === COMMENT_ANCHOR,
    runner: (state, mark) => {
      state.withMark(mark, 'textDirective', undefined, {
        name: NAME,
        attributes: { id: mark.attrs.threadId as string },
      });
    },
  },
}));

/**
 * Container anchor node ↔ `containerDirective` named `mark`, wrapping block
 * content (the multi-block highlight). `defining` so it survives edits at its
 * edges as a unit.
 */
const commentBlockSchema = $nodeSchema(COMMENT_BLOCK, () => ({
  content: 'block+',
  group: 'block',
  defining: true,
  priority: 0,
  attrs: { threadId: { default: '', validate: 'string' } },
  parseDOM: [
    {
      tag: 'div[data-thread]',
      getAttrs: (dom) => ({ threadId: (dom as HTMLElement).getAttribute('data-thread') ?? '' }),
    },
  ],
  toDOM: (node) => [
    'div',
    { 'data-thread': node.attrs.threadId as string, class: 'docloop-block' },
    0,
  ],
  parseMarkdown: {
    match: (node) =>
      (node as { type?: string }).type === 'containerDirective' && (node as any).name === NAME,
    runner: (state, node, nodeType) => {
      state.openNode(nodeType, { threadId: idOf(node) });
      state.next((node as any).children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === COMMENT_BLOCK,
    runner: (state, node) => {
      state.openNode('containerDirective', undefined, {
        name: NAME,
        attributes: { id: node.attrs.threadId as string },
      });
      state.next(node.content);
      state.closeNode();
    },
  },
}));

/** Handles for the write UI (apply the mark / wrap a block in the node). */
export const commentAnchorMark = commentAnchorSchema;
export const commentBlockNode = commentBlockSchema;

/** Drop-in bundle: remark-directive + the inline mark + the container node. */
export const directivePlugins: MilkdownPlugin[] = [
  ...remarkDirective,
  ...commentAnchorSchema,
  ...commentBlockSchema,
];
