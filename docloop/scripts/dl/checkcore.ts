/**
 * `dl check` — union-aware workspace lint (package C1). Extends
 * `scripts/lint-turn-core.ts`'s single-doc anchor/thread checks to the whole
 * workspace (all tracked top-level `*.md` + `threads/`), and adds the
 * canonical-form gate (rule 6) and the anchor-placement / Milkdown-divergent
 * guards (rules 7-9) the spike flagged.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';
import { extractAnchors } from '../../src/threads';
import { listThreads } from '../../src/threads-store';
import { trackedDocs } from './docs';
import { canonicalize } from './canonical';

export interface CheckIssue {
  level: 'ERROR' | 'WARN';
  message: string;
  doc?: string;
}

const parser = unified().use(remarkParse).use(remarkDirective).use(remarkGfm);

/** Zero-pad a comment sequence number to the `NNNN` filename convention (mirrors lint-turn-core). */
function seqName(seq: number): string {
  return `${String(seq).padStart(4, '0')}.md`;
}

/** Flatten the visible text of a directive's children. */
function flattenText(nodes: { type: string; value?: string; children?: unknown[] }[]): string {
  return nodes
    .map((n) => (typeof n.value === 'string' ? n.value : flattenText((n.children ?? []) as typeof nodes)))
    .join('');
}

interface MarkOccurrence {
  id: string | undefined;
  kind: 'text' | 'leaf' | 'container';
  start: number;
  end: number;
  textLen: number;
  /** The flattened visible text of the span (rule 7 needs its first/last char). */
  text: string;
}

/** Every `:mark`-named directive occurrence in `source`, uncoalesced (one per fragment). */
function markOccurrences(source: string): MarkOccurrence[] {
  const tree = parser.parse(source) as Root;
  const occ: MarkOccurrence[] = [];
  visit(tree, (node) => {
    const t = node.type;
    if (t !== 'textDirective' && t !== 'leafDirective' && t !== 'containerDirective') return;
    const n = node as unknown as {
      name?: string;
      attributes?: { id?: string };
      children?: { type: string; value?: string; children?: unknown[] }[];
      position?: { start: { offset?: number }; end: { offset?: number } };
    };
    if (n.name !== 'mark') return;
    const text = flattenText(n.children ?? []);
    occ.push({
      id: n.attributes?.id,
      kind: t === 'textDirective' ? 'text' : t === 'leafDirective' ? 'leaf' : 'container',
      start: n.position?.start.offset ?? 0,
      end: n.position?.end.offset ?? 0,
      textLen: text.length,
      text,
    });
  });
  return occ;
}

/** Recursively check whether `node` has a descendant of mdast type `type`. */
function containsType(node: { children?: { type: string; children?: unknown[] }[] }, type: string): boolean {
  for (const c of node.children ?? []) {
    if (c.type === type) return true;
    if (containsType(c as { children?: { type: string; children?: unknown[] }[] }, type)) return true;
  }
  return false;
}

/** Rule 9: Milkdown-divergent constructs the spike guards against. */
function milkdownGuardIssues(source: string): CheckIssue[] {
  const tree = parser.parse(source) as Root;
  const issues: CheckIssue[] = [];
  visit(tree, (node) => {
    const n = node as unknown as {
      type: string;
      name?: string;
      value?: string;
      attributes?: { id?: string };
      children?: { type: string; children?: unknown[] }[];
    };
    if (n.type === 'strong' && containsType(n, 'emphasis')) {
      issues.push({ level: 'ERROR', message: 'emphasis nested inside strong — Milkdown-divergent (rule 9a)' });
    }
    if (n.type === 'emphasis' && containsType(n, 'strong')) {
      issues.push({ level: 'ERROR', message: 'strong nested inside emphasis — Milkdown-divergent (rule 9a)' });
    }
    if ((n.type === 'textDirective' || n.type === 'leafDirective') && n.name === 'mark') {
      const children = n.children ?? [];
      if (children.some((c) => c.type !== 'text')) {
        issues.push({
          level: 'ERROR',
          message: 'formatting inside a :mark[...] span is Milkdown-divergent (rule 9b)',
        });
      }
      if (!n.attributes?.id) {
        issues.push({
          level: 'ERROR',
          message: 'bare :mark directive with no id in prose — write the literal `:mark` in backticks (rule 9c)',
        });
      }
    }
    if (n.type === 'html' && /<br\s*\/?>/i.test(n.value ?? '')) {
      issues.push({
        level: 'ERROR',
        message: 'raw <br> inline HTML — use a backslash hard break instead (rule 9d)',
      });
    }
  });
  return issues;
}

/**
 * The full union-aware lint. All tracked top-level `*.md` docs + the
 * `threads/` store are read once; rules 1-9 (see dl-C-check-commit-verbs.md)
 * are checked across that union.
 */
export async function checkWorkspace(ws: string): Promise<CheckIssue[]> {
  const issues: CheckIssue[] = [];
  const docs = await trackedDocs(ws);
  const threadsDir = join(ws, 'threads');

  const perDoc = new Map<string, { text: string; occ: MarkOccurrence[]; anchors: { id: string; text: string }[] }>();
  const idToDocs = new Map<string, Set<string>>();

  for (const doc of docs) {
    const text = readFileSync(join(ws, doc), 'utf8');
    const occ = markOccurrences(text);
    const anchors = extractAnchors(text);
    perDoc.set(doc, { text, occ, anchors });
    for (const a of anchors) {
      if (!idToDocs.has(a.id)) idToDocs.set(a.id, new Set());
      idToDocs.get(a.id)!.add(doc);
    }
  }

  // Rule 1 (E): anchor id present in >1 doc.
  for (const [id, docSet] of idToDocs) {
    if (docSet.size > 1) {
      issues.push({
        level: 'ERROR',
        message: `anchor id ${id} is duplicated across more than one doc: ${[...docSet].sort().join(', ')}`,
      });
    }
  }

  // Rule 5 (W): non-t<N> id.
  for (const [doc, d] of perDoc) {
    for (const a of d.anchors) {
      if (!/^t\d+$/.test(a.id)) {
        issues.push({
          level: 'WARN',
          message: `anchor #${a.id} in ${doc} has a non-standard id (expected t<N>)`,
          doc,
        });
      }
    }
  }

  // Rule 7 (E): empty span, or an inline anchor split mid-word.
  for (const [doc, d] of perDoc) {
    for (const o of d.occ) {
      if (o.kind !== 'text' || !o.id) continue; // bare/id-less handled by rule 9c
      if (o.textLen === 0) {
        issues.push({ level: 'ERROR', message: `anchor #${o.id} in ${doc} has an empty span`, doc });
        continue;
      }
      // A boundary only counts as "mid-word" when BOTH sides of it are word
      // characters: the character just outside the anchor AND the anchor's
      // own edge character. A punctuation-first/last span (e.g. the anchor
      // opening on a comma) sits right after a word character without being
      // a split — only \w|\w across the seam is a real inbound fragment.
      const before = d.text[o.start - 1] ?? '';
      const after = d.text[o.end] ?? '';
      const spanFirst = o.text[0] ?? '';
      const spanLast = o.text[o.text.length - 1] ?? '';
      const splitAtStart = /\w/.test(before) && /\w/.test(spanFirst);
      const splitAtEnd = /\w/.test(after) && /\w/.test(spanLast);
      if (splitAtStart || splitAtEnd) {
        issues.push({ level: 'ERROR', message: `anchor #${o.id} in ${doc} is split mid-word`, doc });
      }
    }
  }

  // Rule 8 (W): the same id in >3 separate :mark fragments.
  for (const [doc, d] of perDoc) {
    const counts = new Map<string, number>();
    for (const o of d.occ) {
      if (!o.id) continue;
      counts.set(o.id, (counts.get(o.id) ?? 0) + 1);
    }
    for (const [id, n] of counts) {
      if (n > 3) {
        issues.push({
          level: 'WARN',
          message: `anchor #${id} in ${doc} is fragmented into ${n} separate :mark pieces`,
          doc,
        });
      }
    }
  }

  // Rule 6 (E): doc not in canonical form.
  for (const [doc, d] of perDoc) {
    try {
      const canon = await canonicalize(d.text);
      if (canon !== d.text) {
        issues.push({ level: 'ERROR', message: `${doc} is not in canonical form — run \`dl edit\`/canonicalize`, doc });
      }
    } catch (err) {
      issues.push({
        level: 'ERROR',
        message: `${doc} is not in canonical form (${err instanceof Error ? err.message : String(err)})`,
        doc,
      });
    }
  }

  // Rule 9 (E): Milkdown-divergent constructs.
  for (const [doc, d] of perDoc) {
    for (const issue of milkdownGuardIssues(d.text)) issues.push({ ...issue, doc });
  }

  // Rules 2 / 3 / 3b / 4: anchors <-> threads, union-aware.
  const liveIds = new Set<string>();
  for (const [, d] of perDoc) for (const a of d.anchors) liveIds.add(a.id);

  const threads = await listThreads(threadsDir);
  const threadsById = new Map(threads.map((t) => [t.id, t]));

  // Rule 2 (E): anchor with no thread directory / empty thread.
  for (const [doc, d] of perDoc) {
    for (const a of d.anchors) {
      const t = threadsById.get(a.id);
      if (!t || t.comments.length === 0) {
        issues.push({ level: 'ERROR', message: `anchor #${a.id} in ${doc} has no thread`, doc });
      }
    }
  }

  // Rule 3 / 3b (E), rule 4 (E): thread <-> anchor consistency + frontmatter.
  for (const t of threads) {
    const anchored = liveIds.has(t.id);
    if (!anchored && !t.resolved) {
      issues.push({
        level: 'ERROR',
        message: `thread ${t.id}/ is orphaned (no live anchor in any doc and no resolved marker)`,
      });
    }
    if (anchored && t.resolved) {
      issues.push({
        level: 'ERROR',
        message: `thread ${t.id}/ has a resolved marker but its anchor is still live`,
      });
    }
    for (const c of t.comments) {
      const malformed = !c.author || Number.isNaN(Date.parse(c.created));
      if (malformed) {
        issues.push({ level: 'ERROR', message: `${t.id}/${seqName(c.seq)} has malformed frontmatter` });
      }
    }
  }

  return issues;
}
