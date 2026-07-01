/**
 * Anchor extraction + id allocation over the document markdown.
 *
 * Since the sidecar refactor, comment *bodies* no longer live in the document —
 * they are files in the `threads/<id>/` store (see src/threads-store.ts). All the
 * document holds is the **anchor**: a `:mark[span]{#id}` inline directive or a
 * `:::mark{#id}…:::` container directive marking the highlighted span. This module
 * reads those anchors back out (to drive the sidebar / turn render) and unwraps
 * them (on resolve).
 *
 * Anchor *detection* ({@link extractAnchors}) goes through the real markdown
 * parser (remark + remark-directive — the same directive grammar Milkdown uses),
 * NOT a regex, so it is code-aware: a literal `:mark[…]{#id}` written inside
 * inline code or a fenced block is correctly ignored rather than surfacing as a
 * phantom thread. The string transforms ({@link unwrapAnchor}, {@link stripAnchors})
 * stay regex-based — they need surgical, position-preserving edits (the hunk
 * reconstruction in src/hunks.ts walks them in lock-step with the wrapped text).
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';

/** A comment anchor in the document: the thread id and its highlighted span. */
export interface Anchor {
  /** the id shared by the `:mark`/`:::mark` anchor and its `threads/<id>/` store */
  id: string;
  /** the text inside the anchor (the highlighted span); '' for a container anchor */
  text: string;
}

/** Directive name that marks our anchors (mirrors NAME in src/anchor.ts). */
const NAME = 'mark';

/** Shared markdown→mdast parser carrying the same directive grammar as the editor. */
const mdastParser = unified().use(remarkParse).use(remarkDirective);

/** A minimal mdast node shape — enough to walk for directives and collect text. */
interface MdNode {
  type: string;
  name?: string;
  value?: string;
  attributes?: { id?: string };
  children?: MdNode[];
}

/** Concatenate the visible text of an mdast subtree (text + inline code). */
function mdastText(node: MdNode): string {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(mdastText).join('');
}

/**
 * Extract the comment anchors from a docloop markdown document, one entry per id
 * in document order. Parsed through remark-directive, so `:mark…`/`:::mark…`
 * inside code is ignored. A span broken by inline formatting serialises as
 * several same-id directives (see src/anchor.ts) — their text is coalesced so the
 * anchor reads as one highlighted span. Container anchors contribute their id
 * with empty text (their span is whole blocks, surfaced in the doc).
 */
export function extractAnchors(markdown: string): Anchor[] {
  const anchors: Anchor[] = [];
  const byId = new Map<string, Anchor>();

  const visit = (node: MdNode): void => {
    const isDirective =
      node.type === 'textDirective' ||
      node.type === 'leafDirective' ||
      node.type === 'containerDirective';
    if (isDirective && node.name === NAME) {
      const id = String(node.attributes?.id ?? '');
      if (id) {
        // Container anchors mark whole blocks; their "text" is not a short quote.
        const text = node.type === 'containerDirective' ? '' : mdastText(node);
        const existing = byId.get(id);
        if (existing) {
          if (text) existing.text = existing.text ? `${existing.text} ${text}` : text;
        } else {
          const anchor: Anchor = { id, text };
          byId.set(id, anchor);
          anchors.push(anchor);
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };

  visit(mdastParser.parse(markdown) as unknown as MdNode);
  return anchors;
}

/** Escape a thread id for safe use inside a RegExp. */
function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Unwrap a single thread's anchor back to plain text, leaving the document
 * content intact: inline `:mark[TEXT]{#id}` → `TEXT`, container
 * `:::mark{#id}\nBLOCKS\n:::` → `BLOCKS`. Other anchors are left untouched. Used
 * by "resolve" (the store directory is deleted separately).
 */
export function unwrapAnchor(markdown: string, id: string): string {
  const esc = reEscape(id);
  // The inline closer `]{#id}` is id-SPECIFIC, so a naive `[\s\S]*?` body would
  // cross earlier anchors (whose `]{#otherId}` don't terminate it) and swallow
  // them up to this id's closer. The tempered `(?:(?!\]\{#)[\s\S])*` body refuses
  // to cross any `]{#` boundary, so a match can only start at THIS anchor's own
  // `:mark[`. (Container openers are already id-specific, so they need no guard.)
  return markdown
    .replace(new RegExp(`:mark\\[((?:(?!\\]\\{#)[\\s\\S])*)\\]\\{#${esc}\\}`, 'g'), '$1')
    .replace(new RegExp(`:::mark\\{#${esc}\\}\\n([\\s\\S]*?)\\n:::`, 'g'), '$1');
}

/**
 * Strip every comment anchor back to its plain text — inline `:mark[TEXT]{#id}`
 * → `TEXT`, container `:::mark{#id}\nBLOCKS\n:::` → `BLOCKS`. The whole-document
 * counterpart to {@link unwrapAnchor} (which targets one id). Used wherever a diff
 * should see document *content* without anchor scaffolding (the turn render and
 * the Changes panel), so opening/closing a thread never registers as an edit.
 */
export function stripAnchors(markdown: string): string {
  return markdown
    .replace(/:mark\[([\s\S]*?)\]\{#[^}]+\}/g, '$1')
    .replace(/:::mark\{#[^}]+\}\n([\s\S]*?)\n:::/g, '$1');
}

/** Matches a `t<N>` thread id and captures the numeric suffix. */
const ID_RE = /^t(\d+)$/;

/**
 * The stable display number for a thread — the numeric part of its id (`t3` → 3).
 * Used identically by the in-text badge and the sidebar card so they always
 * agree, and because it derives from the id it never shifts when another thread is
 * added or removed (unlike a positional 1..N counter). Non-`t<N>` ids fall back to
 * the id itself.
 */
export function threadNumber(id: string): string {
  return ID_RE.exec(id)?.[1] ?? id;
}

/**
 * Next sequential id of the form `t<N>` given the ids already in use: max numeric
 * suffix + 1, or `t1` if none qualify. The caller passes every id already in play
 * — both store thread ids AND anchor ids in the document — so a freshly applied
 * anchor never collides with one whose store directory doesn't exist yet (threads
 * are created lazily on the first reply). Ids that don't match `^t(\d+)$` are
 * ignored when computing the max; they can't collide with this scheme.
 */
export function nextThreadId(existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const m = ID_RE.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `t${max + 1}`;
}
