/**
 * Structural completeness gate for a turn: anchors ↔ thread directories ↔
 * well-formed frontmatter. Deliberately does NOT re-run the content-safety
 * check that `canonicalize()`/`thread.ts` already own (src/content-check.ts) —
 * this is structural only, fast, and needs no DOM/editor.
 *
 * Split from `scripts/lint-turn.ts` (the CLI entry point) so it's directly
 * unit-testable.
 */
import { readFile } from 'node:fs/promises';
import { extractAnchors } from '../src/threads';
import { listThreads } from '../src/threads-store';

export interface LintIssue {
  level: 'ERROR' | 'WARN';
  message: string;
}

export interface LintPaths {
  docPath: string;
  threadsDir: string;
}

/** Matches a `t<N>` thread id — the only shape that gets no WARN. */
const ID_RE = /^t\d+$/;

/** Zero-pad a comment sequence number to the `NNNN` filename convention. */
function seqName(seq: number): string {
  return `${String(seq).padStart(4, '0')}.md`;
}

export async function lintTurn(paths: LintPaths): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];
  const markdown = await readFile(paths.docPath, 'utf8').catch(() => '');
  const anchors = extractAnchors(markdown);
  const anchorIds = new Set(anchors.map((a) => a.id));
  const threads = await listThreads(paths.threadsDir);
  const threadsById = new Map(threads.map((t) => [t.id, t]));

  for (const a of anchors) {
    if (!ID_RE.test(a.id)) {
      issues.push({ level: 'WARN', message: `anchor #${a.id} has a non-standard id (expected t<N>)` });
    }
    const thread = threadsById.get(a.id);
    if (!thread || thread.comments.length === 0) {
      issues.push({ level: 'ERROR', message: `anchor #${a.id} has no thread directory` });
    }
  }

  for (const t of threads) {
    const anchored = anchorIds.has(t.id);
    if (!anchored && !t.resolved) {
      issues.push({ level: 'ERROR', message: `thread ${t.id}/ is orphaned (no live anchor and no resolved marker)` });
    }
    if (anchored && t.resolved) {
      issues.push({ level: 'ERROR', message: `thread ${t.id}/ has a resolved marker but its anchor is still live` });
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
