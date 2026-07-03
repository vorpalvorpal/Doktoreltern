/**
 * Gate against remark-directive's "any `:word` is a directive attempt" syntax.
 *
 * `:mark[…]{#id}` (src/anchor.ts) is the only directive docloop's Milkdown
 * schema understands. But remark-directive's inline grammar fires on ANY
 * colon immediately followed by a word character, anywhere in running text —
 * "note:check", "type:string", "10:30am" all parse as `textDirective` nodes,
 * not just deliberately-authored `:mark…`. Milkdown has no ProseMirror node/mark
 * registered for those other names, so loading one throws `MilkdownError:
 * Cannot match target parser for node: {type: "textDirective", ...}` — which
 * takes down whatever render it happens inside (a comment body, in practice;
 * see src/main.ts's renderComment / renderThreads).
 *
 * This remark transformer runs after remark-directive's parser extensions
 * (which is all it needs — those are parse-time, not pipeline-order-dependent)
 * and demotes any directive node whose name isn't on the allowlist back to the
 * literal source text it was parsed from, before Milkdown ever sees the tree.
 * That's how a reader would expect an unrecognised/malformed directive to
 * degrade — as plain text — not a crash.
 */
import { visit } from 'unist-util-visit';
import type { Paragraph, Root, RootContent, Text } from 'mdast';
import type { Plugin } from 'unified';
import type { VFile } from 'vfile';

const DIRECTIVE_TYPES = new Set(['textDirective', 'leafDirective', 'containerDirective']);

/** Recover the exact original markdown for a node, falling back to `:name` if position info is missing. */
function literalTextOf(node: RootContent, source: string): string {
  const pos = node.position;
  if (pos && typeof pos.start.offset === 'number' && typeof pos.end.offset === 'number') {
    return source.slice(pos.start.offset, pos.end.offset);
  }
  return `:${(node as { name?: string }).name ?? ''}`;
}

/**
 * A remark plugin (unified attacher) that demotes `textDirective` /
 * `leafDirective` / `containerDirective` nodes whose `name` isn't in
 * `knownNames` back to literal text. Inline (`textDirective`) directives
 * become a `text` node; block-level ones become a one-paragraph `text` node,
 * since a bare `text` node isn't valid flow content.
 */
export function createDirectiveNameGate(knownNames: readonly string[]): Plugin<[], Root> {
  const known = new Set(knownNames);
  return function directiveNameGate() {
    return (tree: Root, file: VFile) => {
      const source = String(file.value ?? '');
      visit(tree, (node, index, parent) => {
        if (!parent || index == null || !DIRECTIVE_TYPES.has(node.type)) return;
        const name = (node as { name?: string }).name;
        if (name !== undefined && known.has(name)) return;

        const literal = literalTextOf(node as RootContent, source);
        const textNode: Text = { type: 'text', value: literal };
        const replacement: RootContent =
          node.type === 'textDirective' ? textNode : ({ type: 'paragraph', children: [textNode] } as Paragraph);
        (parent.children as RootContent[])[index] = replacement;
      });
    };
  };
}
