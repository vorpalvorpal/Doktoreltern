/**
 * The block model shared by `dl read`, `dl edit`, and `dl agenda`.
 *
 * Blocks are enumerated 1-based over the mdast of the canonical source: one
 * block per top-level node, EXCEPT a list contributes one block per top-level
 * item (nested content rides with the item) and a `:::mark` container directive
 * is a single block (its fences are content). Each block carries the exact
 * source slice from its own start to the next block's start, so the separator
 * (blank lines) attaches to the preceding block and leading whitespace attaches
 * to the first block.
 *
 * Load-bearing invariant: `blocks.map(b => b.segment).join('') === source`.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import type { Root, RootContent, Heading } from 'mdast';

export interface Block {
  /** 1-based ordinal */
  n: number;
  /** exact source slice, incl. trailing separator */
  segment: string;
  /** enclosing headings, outermost first (for section context) */
  headingTrail: string[];
}

const parser = unified().use(remarkParse).use(remarkDirective).use(remarkGfm);

/** Concatenate the visible text of an mdast heading (text + inline code). */
function nodeText(node: { value?: string; children?: unknown[] }): string {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? [])
    .map((c) => nodeText(c as { value?: string; children?: unknown[] }))
    .join('');
}

/** A flattened block unit before segments are tiled: a node with a start offset. */
interface Unit {
  start: number;
  node: RootContent;
}

/** Expand the top-level mdast children into block units (lists → one per item). */
function toUnits(tree: Root): Unit[] {
  const units: Unit[] = [];
  for (const child of tree.children) {
    if (child.type === 'list') {
      for (const item of child.children) {
        const off = item.position?.start.offset;
        if (off != null) units.push({ start: off, node: item as unknown as RootContent });
      }
    } else {
      const off = child.position?.start.offset;
      if (off != null) units.push({ start: off, node: child });
    }
  }
  return units;
}

/**
 * Detect a heading at the head of a block segment, returning its depth and text.
 * Headings are always top-level blocks, so this reads the first non-blank line;
 * fenced code (which may contain `# fake heading`) never starts a segment with a
 * bare `#`.
 */
function headingInfo(segment: string): { depth: number; text: string } | null {
  const firstLine = segment.replace(/^\s+/, '').split('\n')[0];
  const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(firstLine);
  if (!m) return null;
  return { depth: m[1].length, text: m[2].trim() };
}

export function splitBlocks(source: string): Block[] {
  const tree = parser.parse(source) as Root;
  const units = toUnits(tree);
  if (units.length === 0) return [];

  const blocks: Block[] = [];
  const trail: { depth: number; text: string }[] = [];
  for (let i = 0; i < units.length; i++) {
    // Block 0 starts at 0 (captures leading whitespace); each later block starts
    // at its unit's offset; the final block runs to EOF. This is a contiguous
    // partition of [0, length], so the segments tile the source exactly.
    const start = i === 0 ? 0 : units[i].start;
    const end = i === units.length - 1 ? source.length : units[i + 1].start;
    const segment = source.slice(start, end);

    const node = units[i].node;
    if (node.type === 'heading') {
      const depth = (node as Heading).depth;
      while (trail.length && trail[trail.length - 1].depth >= depth) trail.pop();
      trail.push({ depth, text: nodeText(node as Heading) });
    }
    blocks.push({ n: i + 1, segment, headingTrail: trail.map((t) => t.text) });
  }
  return blocks;
}

/**
 * The block sub-range of a named section: from the matching heading block
 * through the block before the next heading of the same or shallower depth (or
 * EOF). Case-insensitive exact match on heading text. Unknown heading → throws
 * listing the available headings; ambiguous (duplicate) → throws naming the
 * matching ordinals.
 */
export function sectionRange(blocks: Block[], heading: string): { from: number; to: number } {
  const want = heading.trim().toLowerCase();
  const headings = blocks
    .map((b) => ({ b, h: headingInfo(b.segment) }))
    .filter((x): x is { b: Block; h: { depth: number; text: string } } => x.h !== null);

  const matches = headings.filter((x) => x.h.text.toLowerCase() === want);
  if (matches.length === 0) {
    const available = headings.map((x) => x.h.text).join(', ');
    throw new Error(`unknown section "${heading}"; available headings: ${available}`);
  }
  if (matches.length > 1) {
    const ordinals = matches.map((x) => x.b.n).join(' and ');
    throw new Error(`ambiguous heading "${heading}": matches blocks ${ordinals}`);
  }

  const start = matches[0];
  const depth = start.h.depth;
  const from = start.b.n;
  let to = blocks.length;
  for (const x of headings) {
    if (x.b.n > from && x.h.depth <= depth) {
      to = x.b.n - 1;
      break;
    }
  }
  return { from, to };
}
