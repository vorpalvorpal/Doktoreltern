/**
 * Canonical markdown form for `dl` — the DOM-free remark engine.
 *
 * Spike verdict (dl-00-overview, 2026-07-09): remark owns canonical form.
 * `remark-parse` + `remark-directive` + `remark-gfm` + `remark-stringify` with the
 * pinned options below is idempotent and a byte-exact Milkdown fixed point on the
 * real workspace docs, so `dl` never boots jsdom/Milkdown. The Milkdown engine
 * (`canonicalizeMilkdown`) survives behind the same interface for the fixed-point
 * comparison tests only.
 *
 * Two guards keep the round-trip honest, both mdast-based (no editor):
 *  - `assertContentPreserved` — visible text must not change across the round-trip
 *    (fault-injection-tested; the remark engine has no known natural corrupter).
 *  - a malformed-anchor check — a `:mark` directive that is not a well-formed
 *    anchor (missing id / empty inline label) is content Milkdown silently
 *    swallows on render, so we refuse to persist it (this is the bare-`:mark`
 *    case the spike flagged as swallowed).
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { visit } from 'unist-util-visit';
import type { Root, RootContent } from 'mdast';
import type { Plugin } from 'unified';
import { createDirectiveNameGate } from '../../src/directive-gate';

/** Directive name of docloop anchors (mirrors src/anchor.ts / src/threads.ts). */
const NAME = 'mark';

/** Pinned remark-stringify options (spike verdict, dl-00-overview). */
const STRINGIFY_OPTIONS = {
  bullet: '-',
  rule: '-',
  ruleRepetition: 3,
  emphasis: '*',
  strong: '*',
  fence: '`',
  listItemIndent: 'one',
} as const;

/**
 * List-spread normaliser: match Milkdown's serializer by loosening any bullet /
 * task list that carries a task item or an item with more than one block child.
 * Without this, a tight source list with nested block content is NOT a Milkdown
 * fixed point (Milkdown loosens it).
 */
const listSpreadNormaliser: Plugin<[], Root> = () => (tree: Root) => {
  // Loosen a list and every list nested inside it — Milkdown propagates
  // looseness downward, so a nested list under a loosened list is loose too.
  const markLoose = (list: import('mdast').List): void => {
    list.spread = true;
    for (const item of list.children) {
      item.spread = true;
      for (const child of item.children ?? []) {
        if (child.type === 'list') markLoose(child);
      }
    }
  };
  visit(tree, 'list', (list) => {
    const loosen = list.children.some(
      (item) =>
        (item.children?.length ?? 0) > 1 ||
        item.checked === true ||
        item.checked === false,
    );
    if (loosen) markLoose(list);
  });
};

/** Parser used for the round-trip and for the mdast-based guards. */
function makeProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkGfm)
    .use(createDirectiveNameGate([NAME]))
    .use(listSpreadNormaliser)
    .use(remarkStringify, STRINGIFY_OPTIONS);
}

/** A parser without the stringifier, for flattening visible text. */
function makeParser() {
  return unified().use(remarkParse).use(remarkDirective).use(remarkGfm);
}

/** Is this node one of the three directive node types? */
function isDirective(node: { type: string }): boolean {
  return (
    node.type === 'textDirective' ||
    node.type === 'leafDirective' ||
    node.type === 'containerDirective'
  );
}

/**
 * Flatten the VISIBLE text of a markdown string via mdast: literal text, inline
 * code, and fenced-code values, plus the span text carried inside a `mark`
 * anchor. Directive *names* / ids are structure, not visible text. Whitespace is
 * collapsed so pure reflow never registers as a content change.
 */
function visibleText(md: string): string {
  const tree = makeParser().parse(md) as Root;
  let out = '';
  const walk = (node: RootContent | Root): void => {
    if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') {
      out += ' ' + ((node as { value?: string }).value ?? '');
      return;
    }
    // A directive's own visible content is just its children (the span); the
    // name/attributes are structure. Descend into children below.
    for (const child of (node as { children?: RootContent[] }).children ?? []) walk(child);
  };
  walk(tree);
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Throw if the visible text of `after` differs from `before`. Exported per the
 * pinned module API (dl-00-overview) and exercised by fault injection.
 */
export function assertContentPreserved(before: string, after: string): void {
  const b = visibleText(before);
  const a = visibleText(after);
  if (b !== a) {
    throw new Error(`canonicalize: content changed during normalisation (${b} => ${a})`);
  }
}

/**
 * Throw if the output carries a `:mark` directive that is not a well-formed
 * anchor. A bare `:mark` (no id) or an empty inline label is content that
 * Milkdown swallows on render — refuse rather than persist a doc whose text the
 * human editor would silently drop.
 */
function assertAnchorsWellFormed(md: string): void {
  const tree = makeParser().parse(md) as Root;
  let bad: string | null = null;
  visit(tree, (node) => {
    if (bad || !isDirective(node) || (node as { name?: string }).name !== NAME) return;
    const id = (node as { attributes?: { id?: string } }).attributes?.id;
    const hasLabel =
      node.type === 'containerDirective' ||
      ((node as { children?: unknown[] }).children?.length ?? 0) > 0;
    if (!id || !hasLabel) bad = (node as { name?: string }).name ?? NAME;
  });
  if (bad) {
    throw new Error('canonicalize: malformed :mark directive would be lost on render');
  }
}

/**
 * Canonicalise markdown to the pinned remark form. Throws (never returns
 * corrupted output) if a guard trips; callers convert to exit 1 with no write.
 *
 * On escaping: Milkdown's serializer escapes `~`/`@` NON-deterministically with
 * respect to the markdown string (it depends on inline-mark structure earlier in
 * the paragraph — same serializer-state family as Milkdown#704), so a byte-exact
 * `milkdown(canon) === canon` fixed point is unattainable on real docs. The
 * load-bearing invariant is instead ROUND-TRIP IDENTITY through the API
 * boundary: `canonicalize(canonicalizeMilkdown(canon)) === canon` — the GUI may
 * quirk its escapes, but /commit and /save-draft canonicalise (plan C4), so the
 * quirks never reach disk. remark's escaping (always `\~`, `\@`) is canonical.
 */
export async function canonicalize(md: string): Promise<string> {
  const out = String(await makeProcessor().process(md));
  assertContentPreserved(md, out);
  assertAnchorsWellFormed(out);
  return out;
}

/**
 * The Milkdown engine, behind the same interface, for the fixed-point comparison
 * tests only. Lazily bootstraps a DOM when one is not already present (the vitest
 * jsdom environment already provides `document`).
 */
export async function canonicalizeMilkdown(md: string): Promise<string> {
  if (typeof document === 'undefined') {
    const { bootstrapDom } = await import('../dom-bootstrap');
    bootstrapDom();
  }
  const { canonicalize: milkdown } = await import('../../src/canonicalize');
  return milkdown(md);
}
